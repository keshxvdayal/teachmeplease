import argparse
import asyncio
import json
import os
import sys
from contextlib import asynccontextmanager
from urllib.parse import unquote

import uvicorn
from aiortc import RTCIceServer
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from pipecat.transports.smallwebrtc.request_handler import (
    SmallWebRTCPatchRequest,
    SmallWebRTCRequest,
    SmallWebRTCRequestHandler,
)

from bot import TRANSCRIBER, create_tts, run_bot

load_dotenv()

# STUN finds a public route between browser and server; TURN relays media when there is
# none (strict NATs, many mobile networks). Format: a JSON list of RTCIceServer objects.
ICE_SERVERS = json.loads(
    os.getenv("ICE_SERVERS") or '[{"urls": ["stun:stun.l.google.com:19302"]}]'
)
handler = SmallWebRTCRequestHandler(
    ice_servers=[
        RTCIceServer(
            urls=server["urls"],
            username=server.get("username"),
            credential=server.get("credential"),
        )
        for server in ICE_SERVERS
    ]
)


async def warm_up():
    """Loads the speech models before the first call so the opening line isn't slow."""

    def load_speech_models():
        if os.getenv("TTS_ENGINE", "kokoro").lower() != "piper":
            create_tts({"language": "en"})
        TRANSCRIBER.warm_up()

    try:
        await asyncio.to_thread(load_speech_models)
        logger.info("Speech models loaded")
    except Exception as err:
        logger.warning(f"Could not preload speech models: {err}")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    warm_up_task = asyncio.create_task(warm_up())
    yield
    warm_up_task.cancel()
    await handler.close()


app = FastAPI(title="TeachMePlease voice agent", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    # Add the deployed app's origin, e.g. ALLOWED_ORIGINS="https://teachmeplease.vercel.app".
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"]
    + [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/offer")
async def offer(request: SmallWebRTCRequest, raw_request: Request, background_tasks: BackgroundTasks):
    config = json.loads(unquote(raw_request.query_params.get("config", "{}")))

    async def on_connection(connection):
        background_tasks.add_task(run_bot, connection, config)

    return await handler.handle_web_request(request=request, webrtc_connection_callback=on_connection)


@app.patch("/api/offer")
async def ice_candidate(request: SmallWebRTCPatchRequest):
    await handler.handle_patch_request(request)
    return {"status": "success"}


@app.get("/api/ice-servers")
async def ice_servers():
    """The browser connects with the same STUN/TURN servers as the agent."""
    return {"iceServers": ICE_SERVERS}


@app.get("/health")
async def health():
    return {"ok": True, "service": "teachmeplease-voice"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default=os.getenv("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", "7860")))
    args = parser.parse_args()
    logger.remove()
    logger.add(sys.stderr, level="INFO")
    uvicorn.run(app, host=args.host, port=args.port)
