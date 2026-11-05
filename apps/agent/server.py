"""The Plex for Mac brain: the /mac routes, /health, and the routines scheduler.

    uv run uvicorn server:app --port 8790 --reload      (or: pnpm --filter @plex/agent dev)

The Mac app (apps/mac) connects to ws://127.0.0.1:8790/mac/live. See docs/plex-mac.md.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# The service-account key path in .env is relative to apps/agent.
_creds = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
if _creds and not os.path.isabs(_creds):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.path.join(os.path.dirname(__file__), _creds)

from fastapi import FastAPI  # noqa: E402

from plex_brain.routes import router as mac_router  # noqa: E402
from plex_brain.routines import scheduler  # noqa: E402

# A hosted brain without a token would hand Gemini Live, the user's accounts and their money tools
# to anyone with the address, so refuse to start without one.
if os.environ.get("K_SERVICE") and not os.environ.get("MAC_CLIENT_TOKEN"):
    raise RuntimeError("MAC_CLIENT_TOKEN must be set when the brain is hosted")


@asynccontextmanager
async def lifespan(_: FastAPI):
    if os.environ.get("PLEX_SCHEDULER", "on") != "off":
        scheduler.start()
    yield
    await scheduler.stop()


app = FastAPI(title="Plex for Mac brain", lifespan=lifespan)
app.include_router(mac_router)


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}
