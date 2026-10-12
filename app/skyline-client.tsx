'use client';
import { useEffect, useRef } from 'react';
export default function GameClient() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const abort=new AbortController();
    let cancelled = false, dispose: (() => void) | undefined;
    import('../src/main').then(m => cancelled ? (()=>{}) : m.mountSkyline(root.current!,abort.signal)).then(cleanup => {
      if (cancelled) cleanup(); else dispose = cleanup;
    }).catch(() => { if (!cancelled && root.current) root.current.textContent = '暂时无法打开城市，请刷新重试。'; });
    return () => { cancelled = true; abort.abort();dispose?.(); };
  }, []);
  return <div id="app" ref={root} />;
}
