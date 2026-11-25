import socket, time
hosts = ['cpod-1xlpypxmr3u3-s1.podtcp.compshare.cn', 'cpod-1xlpypxmr3u3-s1.pod.compshare.cn']
ports = [27684, 22, 23, 2222, 8188]
for h in hosts:
    for p in ports:
        s = socket.socket(); s.settimeout(4)
        t0 = time.time()
        try:
            s.connect((h, p))
            banner = b''
            try:
                s.settimeout(2); banner = s.recv(64)
            except Exception: pass
            print('OPEN  %-40s %-6d %.2fs %r' % (h, p, time.time()-t0, banner[:40]))
        except Exception as e:
            print('close %-40s %-6d %s' % (h, p, type(e).__name__))
        finally:
            s.close()
