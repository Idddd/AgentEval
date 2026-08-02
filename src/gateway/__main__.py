"""Run the Tool Gateway as a standalone service (in-cluster deployment).

Environment:
    EVAL_GATEWAY_ADMIN_TOKEN  required; authenticates the orchestrator
    PORT                      listen port (default 9000)
"""
from __future__ import annotations

import os
import time

from .server import GatewayServer
from .service import GatewayService


def main() -> None:
    admin_token = os.environ.get("EVAL_GATEWAY_ADMIN_TOKEN", "")
    if not admin_token:
        raise SystemExit("EVAL_GATEWAY_ADMIN_TOKEN must be set")
    port = int(os.environ.get("PORT", "9000"))
    server = GatewayServer(GatewayService(), admin_token=admin_token,
                           port=port, host="0.0.0.0")
    print(f"[gateway] listening on :{server.port}", flush=True)
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        server.close()


if __name__ == "__main__":
    main()
