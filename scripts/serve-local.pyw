# heatfolio ローカル配信サーバー（完全ローカル・tailscale serve のバックエンド）
#
# 127.0.0.1:8080 で heatfolio ディレクトリを静的配信し、加えて保有編集用の
# 保存 API（POST /api/holdings）を提供する。tailscale serve が :8443 でこの
# ポートを tailnet 内へ HTTPS 中継する。外部（インターネット）には出ない。
#
# 保存は「JSON 検証 → 同ディレクトリの一時ファイルへ書き → os.replace で原子置換」。
# 検証に落ちた場合・書き込み失敗時も既存の holdings.json は壊れない。
#
# pythonw.exe（コンソール無し）で常駐させるため http.server の既定ログは
# stderr へ書こうとしてクラッシュする。log_message を無効化して回避する。
#
# 自動起動: HKCU\...\Run の "heatfolio-server" が pythonw でこれを起動する。
# 手動起動: pythonw.exe scripts\serve-local.pyw

import http.server
import socketserver
import json
import os
import tempfile
from functools import partial
from pathlib import Path

HOST = "127.0.0.1"
PORT = 8080
ROOT = Path(__file__).resolve().parent.parent  # scripts/ の一つ上 = リポルート
HOLDINGS = ROOT / "data" / "holdings.json"
MAX_BODY = 1_000_000  # 1MB 上限（保有ファイルは数 KB 程度）


def validate_holdings(obj):
    """holdings.json 全体（meta + holdings）の最低限の構造検証。問題があれば理由文字列を返す。"""
    if not isinstance(obj, dict):
        return "top-level must be an object"
    hs = obj.get("holdings")
    if not isinstance(hs, list) or len(hs) == 0:
        return "holdings must be a non-empty array"
    for i, h in enumerate(hs):
        if not isinstance(h, dict):
            return f"holdings[{i}] must be an object"
        name = h.get("name")
        if not isinstance(name, str) or not name.strip():
            return f"holdings[{i}].name is required"
        bv = h.get("baseValue")
        if isinstance(bv, bool) or not isinstance(bv, (int, float)):
            return f"holdings[{i}].baseValue must be a number"
        mode = h.get("mode", "market")
        if mode not in ("market", "proxy", "manual"):
            return f"holdings[{i}].mode must be market/proxy/manual"
        cur = h.get("currency", "JPY")
        if cur not in ("JPY", "USD"):
            return f"holdings[{i}].currency must be JPY/USD"
    return None


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # pythonw では stderr が無いので黙らせる
        pass

    def _send_json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.split("?")[0] != "/api/holdings":
            self._send_json(404, {"ok": False, "error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            self._send_json(400, {"ok": False, "error": "invalid body size"})
            return
        raw = self.rfile.read(length)
        try:
            obj = json.loads(raw.decode("utf-8"))
        except Exception as e:
            self._send_json(400, {"ok": False, "error": f"invalid JSON: {e}"})
            return
        err = validate_holdings(obj)
        if err:
            self._send_json(400, {"ok": False, "error": err})
            return
        try:
            data = json.dumps(obj, ensure_ascii=False, indent=2) + "\n"
            fd, tmp = tempfile.mkstemp(dir=str(HOLDINGS.parent), prefix=".holdings-", suffix=".tmp")
            try:
                with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
                    f.write(data)
                os.replace(tmp, str(HOLDINGS))  # 原子置換（Windows でも既存を上書き可）
            finally:
                if os.path.exists(tmp):
                    os.remove(tmp)
        except Exception as e:
            self._send_json(500, {"ok": False, "error": f"write failed: {e}"})
            return
        self._send_json(200, {"ok": True})


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True   # 再起動時の bind 失敗を避ける
    daemon_threads = True


def main():
    handler = partial(Handler, directory=str(ROOT))
    with Server((HOST, PORT), handler) as httpd:
        httpd.serve_forever()


if __name__ == "__main__":
    main()
