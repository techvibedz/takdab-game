"""Send a local Python script to the running Blender MCP add-on."""
import json, socket, sys
from pathlib import Path

request = {'type':'execute_code','params':{'code':Path(sys.argv[1]).read_text(encoding='utf-8')}}
with socket.create_connection(('127.0.0.1',9876),timeout=10) as connection:
    connection.settimeout(180)
    connection.sendall(json.dumps(request).encode())
    response=bytearray()
    while True:
        chunk=connection.recv(65536)
        if not chunk: raise RuntimeError('Blender MCP closed before returning a result')
        response.extend(chunk)
        try: result=json.loads(response)
        except json.JSONDecodeError: continue
        print(json.dumps(result,indent=2))
        if result.get('status')!='success': sys.exit(1)
        break
