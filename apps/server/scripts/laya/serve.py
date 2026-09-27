# Owner: Ojas — serves our fine-tuned Laya over Jev's POST /v1/systemone (#274).
# Stock `laya-serve` only knows the published checkpoints (and maps "laya" to the English one), so this
# puts ours in the "typed-decisions" slot, the model name askDecision sends. On the droplet:
#   pip install "laya[serve]==0.3.20"
#   HF_TOKEN=... LAYA_API_KEY=... LAYA_CHECKPOINT=TheKnack/laya-web-decisions LAYA_HOST=127.0.0.1 python serve.py
#   caddy reverse-proxy --from <ip-with-dashes>.sslip.io --to localhost:8000   # HTTPS; LAYA_URL=https://<that host>
# Optional: LAYA_DEVICE=cuda (default auto), LAYA_PORT (8000), LAYA_THREADS (CPU: <= physical cores).
import os

import uvicorn
from laya.router import Router
from laya.serve import _apply_thread_limit, _resolve_port, create_app

_apply_thread_limit()
router = Router(models={"typed-decisions": os.environ["LAYA_CHECKPOINT"]}, device=os.environ.get("LAYA_DEVICE") or None)
router.preload(["typed-decisions"])
uvicorn.run(create_app(router), host=os.environ.get("LAYA_HOST", "0.0.0.0"), port=_resolve_port())
