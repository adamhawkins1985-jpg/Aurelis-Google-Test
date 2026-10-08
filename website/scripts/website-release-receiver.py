#!/usr/bin/env python3
"""AURELIS website release receiver. Accepts only local aurelisdeploy Unix-socket peers."""
import hashlib, io, os, pathlib, shutil, signal, socket, struct, subprocess, tarfile, tempfile, time
ROOT = pathlib.Path('/home/ubuntu/aurelis-vnext')
SOCK = '/tmp/aurelis-website-release.sock'
ALLOWED_UID = 1002
MAX_BYTES = 32 * 1024 * 1024
ALLOWED = {'server.js', 'package.json', 'package-lock.json'}
def log(msg):
    with open(ROOT / 'website-release.log','a') as f:
        f.write(time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())+' '+msg+'\n')
def health():
    return subprocess.run(['curl','-fsS','--max-time','3','http://127.0.0.1:8798/api/health'],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
def server_pid():
    found = []
    for item in pathlib.Path('/proc').iterdir():
        if not item.name.isdigit(): continue
        try:
            cmd = (item/'cmdline').read_bytes().replace(b'\0',b' ').strip()
            if cmd in (b'node /home/ubuntu/aurelis-vnext/server.js',b'/usr/bin/node /home/ubuntu/aurelis-vnext/server.js'):
                found.append(int(item.name))
        except (OSError,PermissionError): pass
    if len(found)!=1: raise RuntimeError('expected one live website server, found '+str(len(found)))
    return found[0]
def restart():
    os.kill(server_pid(),signal.SIGTERM)
    for i in range(30):
        time.sleep(1)
        try:
            new = server_pid()
            if health(): return True
        except RuntimeError: pass
    return False
def deploy(payload, expected):
    if hashlib.sha256(payload).hexdigest()!=expected: raise RuntimeError('checksum mismatch')
    if not health(): raise RuntimeError('website unhealthy before release')
    stage = pathlib.Path(tempfile.mkdtemp(prefix='.aurelis-release-',dir=ROOT))
    try:
        with tarfile.open(fileobj=io.BytesIO(payload),mode='r:gz') as tf:
            members=tf.getmembers()
            if not members: raise RuntimeError('empty release')
            total=0
            for m in members:
                p=pathlib.PurePosixPath(m.name)
                if not m.isfile() or p.is_absolute() or '..' in p.parts or not (
                    str(p) in ALLOWED or (p.parts[0]=='dist' and len(p.parts)>1)
                ): raise RuntimeError('disallowed release entry')
                total+=m.size
            if total>100*1024*1024:raise RuntimeError('expanded release too large')
            tf.extractall(stage,filter='data')
        if not (stage/'dist/index.html').is_file() or not (stage/'server.js').is_file(): raise RuntimeError('missing build files')
        if (stage/'package-lock.json').read_bytes() != (ROOT/'package-lock.json').read_bytes():
            raise RuntimeError('dependency lockfile changed; deployment requires separate dependency review')
        previous=ROOT/'.website-previous'
        if previous.exists():shutil.rmtree(previous)
        previous.mkdir()
        os.rename(ROOT/'dist',previous/'dist')
        os.rename(ROOT/'server.js',previous/'server.js')
        replaced=False
        try:
            os.rename(stage/'dist',ROOT/'dist')
            os.rename(stage/'server.js',ROOT/'server.js')
            replaced=True
            if not restart():raise RuntimeError('new website failed health check')
            log('DEPLOY_SUCCESS '+expected)
            return 'DEPLOY_SUCCESS '+expected
        except Exception:
            if (ROOT/'dist').exists():shutil.rmtree(ROOT/'dist')
            if (ROOT/'server.js').exists():(ROOT/'server.js').unlink()
            os.rename(previous/'dist',ROOT/'dist')
            os.rename(previous/'server.js',ROOT/'server.js')
            if replaced:
                try:restart()
                except Exception:pass
            log('ROLLED_BACK '+expected)
            raise
    finally:
        if stage.exists():shutil.rmtree(stage)
def serve():
    try:os.unlink(SOCK)
    except FileNotFoundError:pass
    sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
    sock.bind(SOCK)
    # The receiver verifies SO_PEERCRED against the dedicated deployment UID.
    os.chmod(SOCK,0o666)
    sock.listen(3)
    log('RECEIVER_READY')
    while True:
        conn,_=sock.accept()
        with conn:
            try:
                pid,uid,gid=struct.unpack('3i',conn.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))
                if uid!=ALLOWED_UID:raise RuntimeError('unauthorized local UID')
                header=b''
                while not header.endswith(b'\n') and len(header)<100:
                    part=conn.recv(1)
                    if not part:break
                    header+=part
                expected=header.strip().decode('ascii')
                if len(expected)!=64 or any(c not in '0123456789abcdef' for c in expected):raise RuntimeError('invalid digest')
                payload=bytearray()
                while True:
                    part=conn.recv(65536)
                    if not part:break
                    payload.extend(part)
                    if len(payload)>MAX_BYTES:raise RuntimeError('release too large')
                result=deploy(bytes(payload),expected)
                conn.sendall((result+'\n').encode())
            except Exception as exc:
                log('DEPLOY_REJECTED '+type(exc).__name__+' '+str(exc))
                try:conn.sendall(('DEPLOY_ERROR '+str(exc)+'\n').encode())
                except OSError:pass
if __name__=='__main__':
    serve()