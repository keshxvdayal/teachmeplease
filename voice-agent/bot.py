import asyncio
import os
import platform
import random
import re
import threading
import time
import urllib.request
from pathlib import Path
from typing import Any

import numpy as np
import soxr
from dotenv import load_dotenv
from loguru import logger
from pipecat.frames.frames import (
    Frame,
    InputAudioRawFrame,
    TTSAudioRawFrame,
    TTSSpeakFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.processors.frameworks.rtvi import RTVIProcessor, RTVIServerMessageFrame
from pipecat.transcriptions.language import Language
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport

load_dotenv()

# The voice agent only listens and speaks. The web app decides what the client says
# (and tracks mood, patience and the end of the call), so text and voice calls behave the same.

# Kokoro voices that sound the most natural in conversation, per language.
KOKORO_VOICES = {
    "en": {"female": "af_heart", "male": "am_michael"},
    "hi": {"female": "hf_alpha", "male": "hm_omega"},
}


_kokoro_lock = threading.Lock()
_kokoro_models: dict[tuple[str, str], Any] = {}


def shared_kokoro(model_path: str, voices_path: str):
    """Loads Kokoro once per process; a fresh model costs seconds on every call otherwise."""
    import onnxruntime as ort
    from kokoro_onnx import Kokoro

    with _kokoro_lock:
        key = (model_path, voices_path)
        if key not in _kokoro_models:
            # Synthesis speed decides whether speech flows without gaps. Four threads is the
            # sweet spot: more spill onto efficiency cores and slow everything down.
            options = ort.SessionOptions()
            options.intra_op_num_threads = min(4, os.cpu_count() or 4)
            options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            session = ort.InferenceSession(model_path, sess_options=options, providers=["CPUExecutionProvider"])
            kokoro = Kokoro.from_session(session, voices_path)
            # The first synthesis compiles the ONNX graph, so do it before anyone is waiting.
            kokoro.create("Hello there.", voice=KOKORO_VOICES["en"]["female"], lang="en-us")
            _kokoro_models[key] = kokoro
        return _kokoro_models[key]


KOKORO_DIR = Path.home() / ".cache" / "pipecat" / "kokoro-onnx"
KOKORO_RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"
# The 8-bit model synthesizes about twice as fast on CPU with little loss in quality.
KOKORO_MODELS = {"int8": "kokoro-v1.0.int8.onnx", "fp32": "kokoro-v1.0.onnx"}


def kokoro_files() -> tuple[str, str]:
    """Paths to the Kokoro model and voices, downloading them on first use."""
    model = KOKORO_MODELS.get(os.getenv("KOKORO_MODEL", "int8"), KOKORO_MODELS["int8"])
    paths = []
    for name in (model, "voices-v1.0.bin"):
        path = KOKORO_DIR / name
        if not path.exists():
            # Download to a temporary name so an interrupted download is never mistaken
            # for a complete model.
            KOKORO_DIR.mkdir(parents=True, exist_ok=True)
            partial = path.with_suffix(path.suffix + ".part")
            logger.info(f"Downloading {name}…")
            urllib.request.urlretrieve(f"{KOKORO_RELEASE}/{name}", partial)
            partial.rename(path)
        paths.append(str(path))
    return paths[0], paths[1]


# Where a long sentence can be split without sounding odd: after clause punctuation, or
# before a conjunction.
_CLAUSE_BREAK = re.compile(r"(?<=[,;:])\s+|\s+[—–-]\s+|\s+(?=(?:and|but|so|because|which|or)\b)")
CHUNK_WORDS = 10
# A phrase trailing off ("Well...", "we could — ") is followed by a beat, as if thinking.
THINKING_PAUSE = re.compile(r"(\.\.\.|…|[—–-])$")
THINKING_PAUSE_SECS = 0.35


def speech_chunks(text: str) -> list[str]:
    """Splits text into short chunks that are quick to synthesize.

    Each chunk is rendered while the previous one plays, so a chunk must take less time to
    render than the audio ahead of it lasts. Whole sentences can take seconds, which left
    audible gaps; clause-sized chunks keep speech flowing, and the breaks fall where a
    speaker would naturally pause anyway.
    """
    chunks: list[str] = []
    for sentence in re.split(r"(?<=[.!?…।])\s+", text.strip()):
        if not sentence:
            continue
        if len(sentence.split()) <= CHUNK_WORDS:
            chunks.append(sentence)
            continue
        current = ""
        for part in (p for p in _CLAUSE_BREAK.split(sentence) if p and p.strip()):
            candidate = f"{current} {part}".strip()
            if current and len(candidate.split()) > CHUNK_WORDS:
                chunks.append(current)
                current = part.strip()
            else:
                current = candidate
        if current:
            chunks.append(current)
    return chunks


def load_kokoro():
    import pipecat.services.kokoro.tts as kokoro_tts

    kokoro_tts.Kokoro = shared_kokoro

    class ChunkedKokoroTTSService(kokoro_tts.KokoroTTSService):
        """Synthesizes short chunks one after another, so playback starts fast and never
        waits on a long sentence (Kokoro renders a whole text block before any audio).

        It also gives the delivery a human rhythm: each phrase is spoken at a slightly
        different pace, and a trailing "..." or dash gets a thinking pause.
        """

        async def run_tts(self, text: str, context_id: str):
            base_speed = self._settings.speed
            try:
                for chunk in speech_chunks(text):
                    self._settings.speed = base_speed * random.uniform(0.96, 1.04)
                    async for frame in super().run_tts(chunk, context_id):
                        yield frame
                    if THINKING_PAUSE.search(chunk):
                        yield TTSAudioRawFrame(
                            audio=bytes(int(self.sample_rate * THINKING_PAUSE_SECS) * 2),
                            sample_rate=self.sample_rate,
                            num_channels=1,
                            context_id=context_id,
                        )
            finally:
                self._settings.speed = base_speed

    return ChunkedKokoroTTSService


def language(config: dict[str, Any]) -> Language:
    # Hinglish is spoken in a mix of both; English recognition keeps it in Roman script.
    return Language.HI if config.get("language") == "hi" else Language.EN


class Transcriber:
    """Whisper, loaded once per process and used one turn at a time."""

    # Below this loudness a hold is treated as silence: Whisper tends to invent words for it.
    SILENCE_RMS = 0.004

    def __init__(self):
        self._lock = threading.Lock()
        self._faster_whisper = None
        self._mlx = platform.system() == "Darwin" and platform.machine() == "arm64"

    def _run(self, audio: np.ndarray, lang: str) -> str:
        with self._lock:
            if self._mlx:
                # MLX runs Whisper on the Apple Silicon GPU, several times faster than the CPU.
                import mlx_whisper

                result = mlx_whisper.transcribe(
                    audio,
                    path_or_hf_repo=os.getenv("MLX_WHISPER_MODEL", "mlx-community/whisper-small-mlx"),
                    language=lang,
                    temperature=0.0,
                    condition_on_previous_text=False,
                )
                segments = result.get("segments", [])
            else:
                if self._faster_whisper is None:
                    from faster_whisper import WhisperModel

                    # Quantized inference is several times faster on CPU-only servers.
                    self._faster_whisper = WhisperModel(
                        os.getenv("WHISPER_MODEL", "small"), device="cpu", compute_type="int8"
                    )
                found, _ = self._faster_whisper.transcribe(
                    audio, language=lang, beam_size=1, condition_on_previous_text=False
                )
                segments = [{"text": s.text, "no_speech_prob": s.no_speech_prob} for s in found]
        return " ".join(
            s["text"].strip() for s in segments if s.get("no_speech_prob", 0.0) < 0.6
        ).strip()

    def transcribe(self, audio: np.ndarray, lang: str) -> str:
        """Text for one push-to-talk turn (16 kHz mono float samples), or "" if nothing was said."""
        if audio.size < 16000 * 0.3 or float(np.sqrt(np.mean(audio**2))) < self.SILENCE_RMS:
            return ""
        return self._run(audio, lang)

    def warm_up(self):
        """Loads the model, so the first turn of the first call isn't slow."""
        self._run(np.random.default_rng(0).normal(0, 0.01, 16000).astype(np.float32), "en")


TRANSCRIBER = Transcriber()


def create_tts(config: dict[str, Any]):
    if os.getenv("TTS_ENGINE", "kokoro").lower() == "piper":
        from pipecat.services.piper.tts import PiperTTSService

        return PiperTTSService(
            settings=PiperTTSService.Settings(voice=os.getenv("PIPER_VOICE", "en_US-lessac-medium"))
        )
    KokoroTTSService = load_kokoro()
    model_path, voices_path = kokoro_files()
    lang = language(config)
    voices = KOKORO_VOICES["hi" if lang == Language.HI else "en"]
    gender = config.get("gender") if config.get("gender") in voices else "female"
    voice = os.getenv("KOKORO_VOICE") or voices[gender]
    # Each persona can have its own English voice and accent (Hindi uses the Hindi voices).
    requested = str(config.get("voice") or "")
    if lang != Language.HI and requested in shared_kokoro(model_path, voices_path).voices.files:
        voice = requested
    return KokoroTTSService(
        model_path=model_path,
        voices_path=voices_path,
        settings=KokoroTTSService.Settings(
            voice=voice,
            language=lang,
            speed=float(os.getenv("KOKORO_SPEED", "1.0")),
        ),
        # A long sentence can take ~3s to render on CPU; don't give up on it as silent.
        stop_frame_timeout_s=6.0,
    )


class PushToTalk(FrameProcessor):
    """Records the learner while they hold the talk button and transcribes each hold.

    Every hold is one numbered turn: audio from just before the press to shortly after the
    release is transcribed as a single recording, and the text goes back to the browser with
    that turn's id. A slow transcription can therefore never be mistaken for the next turn.
    Outside a hold the microphone is ignored, so the client's own voice is never transcribed.
    """

    SAMPLE_RATE = 16000
    # Catch the start of a word spoken a moment before the press registers.
    PRE_ROLL_SECS = 0.3
    # Audio reaches the server a little after the release message, and people often let go
    # while finishing their last word, so keep recording briefly after release.
    RELEASE_TAIL_SECS = 0.6

    def __init__(self, config: dict[str, Any], **kwargs):
        super().__init__(**kwargs)
        self._lang = "hi" if language(config) == Language.HI else "en"
        self._open = False
        self._turn_id: Any = None
        self._buffer = bytearray()
        self._pre_roll = bytearray()
        self._close_task: asyncio.Task | None = None
        self.speak_started: float | None = None

    async def press(self, turn_id: Any):
        if self._close_task:
            # Pressed again during the tail: carry on recording the same turn.
            self._close_task.cancel()
            self._close_task = None
            self._turn_id = turn_id
            return
        if self._open:
            return
        self._open = True
        self._turn_id = turn_id
        self._buffer = bytearray(self._pre_roll)
        # Talking over the client stops them, like on a real call.
        await self.broadcast_interruption()

    async def release(self):
        if self._open and not self._close_task:
            self._close_task = asyncio.create_task(self._close_after_tail())

    async def speak(self, text: str):
        """Says a line straight away, without queueing behind incoming microphone audio."""
        self.speak_started = time.monotonic()
        await self.push_frame(TTSSpeakFrame(text, append_to_context=False))

    async def _close_after_tail(self):
        await asyncio.sleep(self.RELEASE_TAIL_SECS)
        self._open = False
        self._close_task = None
        turn_id, pcm = self._turn_id, bytes(self._buffer)
        self._buffer = bytearray()
        samples = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
        started = time.monotonic()
        try:
            text = await asyncio.to_thread(TRANSCRIBER.transcribe, samples, self._lang)
        except Exception as err:
            logger.error(f"Transcription failed: {err}")
            text = ""
        logger.info(f"Turn {turn_id}: {len(samples) / self.SAMPLE_RATE:.1f}s of speech transcribed in {time.monotonic() - started:.2f}s: {text!r}")
        await self.push_frame(RTVIServerMessageFrame(data={"type": "user_turn", "id": turn_id, "text": text}))

    def _to_16k(self, frame: InputAudioRawFrame) -> bytes:
        if frame.sample_rate == self.SAMPLE_RATE and frame.num_channels == 1:
            return frame.audio
        samples = np.frombuffer(frame.audio, dtype=np.int16).reshape(-1, frame.num_channels).mean(axis=1)
        resampled = soxr.resample(samples, frame.sample_rate, self.SAMPLE_RATE)
        return resampled.astype(np.int16).tobytes()

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, InputAudioRawFrame):
            audio = self._to_16k(frame)
            if self._open:
                self._buffer += audio
            else:
                keep = int(self.SAMPLE_RATE * self.PRE_ROLL_SECS) * 2
                self._pre_roll = (self._pre_roll + audio)[-keep:]
            # Nothing downstream needs the microphone audio.
            return
        await self.push_frame(frame, direction)


class SpeechLatencyLog(FrameProcessor):
    """Logs how long each line took from being requested to its first audio."""

    def __init__(self, ptt: PushToTalk, **kwargs):
        super().__init__(**kwargs)
        self._ptt = ptt

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, TTSAudioRawFrame) and self._ptt.speak_started is not None:
            logger.info(f"Speech started {time.monotonic() - self._ptt.speak_started:.2f}s after it was requested")
            self._ptt.speak_started = None
        await self.push_frame(frame, direction)


async def run_bot(webrtc_connection, config: dict[str, Any]):
    transport = SmallWebRTCTransport(
        webrtc_connection=webrtc_connection,
        params=TransportParams(audio_in_enabled=True, audio_out_enabled=True),
    )
    ptt = PushToTalk(config)
    rtvi = RTVIProcessor()
    pipeline = Pipeline(
        [
            transport.input(),
            ptt,
            create_tts(config),
            SpeechLatencyLog(ptt),
            transport.output(),
        ]
    )
    task = PipelineTask(
        pipeline,
        params=PipelineParams(enable_metrics=True, enable_usage_metrics=True),
        rtvi_processor=rtvi,
    )

    @rtvi.event_handler("on_client_message")
    async def on_client_message(_rtvi, message):
        data = message.data or {}
        if message.type == "ptt":
            await (ptt.press(data.get("id")) if data.get("pressed") else ptt.release())
        elif message.type == "speak":
            text = str(data.get("text", "")).strip()
            if text:
                await ptt.speak(text)

    @transport.event_handler("on_client_connected")
    async def on_client_connected(_transport, _client):
        logger.info("Voice client connected")

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(_transport, _client):
        logger.info("Voice client disconnected")
        await task.cancel()

    await PipelineRunner(handle_sigint=False).run(task)
