FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    HOST=0.0.0.0 \
    PORT=7860 \
    WHISPER_MODEL=small

COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /usr/local/bin/uv
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

COPY bot.py server.py ./
# Bake the speech models into the image so a fresh container answers its first call quickly.
RUN .venv/bin/python -c "\
from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8'); \
import bot; bot.create_tts({'language': 'en'})"

EXPOSE 7860
CMD [".venv/bin/python", "server.py"]
