import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAppTheme } from '@/src/providers/theme-provider';

function htmlDocument(pdfModule: string, workerModule: string, pdfBase64: string, dark: boolean) {
  const background = dark ? '#0a0f1e' : '#e2e8f0';
  const surface = dark ? '#0f172a' : '#ffffff';
  const text = dark ? '#f8fafc' : '#0f172a';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5,user-scalable=yes"><style>
  *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:${background};color:${text};font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{padding:52px 10px 18px;touch-action:pan-x pan-y pinch-zoom}.toolbar{position:fixed;z-index:5;top:8px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:12px;background:${surface};box-shadow:0 4px 16px #0005}.toolbar button{width:34px;height:32px;border:0;border-radius:8px;background:#2563eb;color:white;font-size:20px}.toolbar span{min-width:86px;text-align:center;font-size:12px;font-weight:700}.page{margin:0 auto 12px;background:white;box-shadow:0 3px 15px #0005}.page canvas{display:block;width:100%;height:auto}.error{padding:40px 20px;text-align:center;color:#ef4444}.loading{text-align:center;padding:40px}</style></head><body><div class="toolbar"><button id="minus" aria-label="Zoom out">−</button><span id="indicator">Loading…</span><button id="plus" aria-label="Zoom in">+</button></div><main id="viewer"><div class="loading">Preparing report…</div></main><script type="module">
  const moduleUrl=URL.createObjectURL(new Blob([${JSON.stringify(pdfModule)}],{type:'text/javascript'}));
  const workerUrl=URL.createObjectURL(new Blob([${JSON.stringify(workerModule)}],{type:'text/javascript'}));
  const pdfjs=await import(moduleUrl);pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
  const viewer=document.getElementById('viewer'),indicator=document.getElementById('indicator');let pdf=null,zoom=1,renderToken=0;
  function decode(value){const binary=atob(value),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes}
  async function render(){const token=++renderToken;viewer.innerHTML='';const width=Math.max(280,document.documentElement.clientWidth-20);const pages=[];for(let n=1;n<=pdf.numPages;n++){if(token!==renderToken)return;const page=await pdf.getPage(n),base=page.getViewport({scale:1}),scale=(width/base.width)*zoom,viewport=page.getViewport({scale});const wrap=document.createElement('section');wrap.className='page';wrap.dataset.page=String(n);wrap.style.width=viewport.width+'px';const canvas=document.createElement('canvas'),ratio=window.devicePixelRatio||1;canvas.width=Math.floor(viewport.width*ratio);canvas.height=Math.floor(viewport.height*ratio);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';wrap.appendChild(canvas);viewer.appendChild(wrap);const context=canvas.getContext('2d');await page.render({canvasContext:context,viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]}).promise;pages.push(wrap)}observe(pages)}
  function observe(pages){indicator.textContent='Page 1 of '+pdf.numPages;const observer=new IntersectionObserver(entries=>{const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(visible)indicator.textContent='Page '+visible.target.dataset.page+' of '+pdf.numPages},{threshold:[.25,.5,.75]});pages.forEach(page=>observer.observe(page))}
  document.getElementById('minus').onclick=()=>{zoom=Math.max(.65,zoom-.15);render()};document.getElementById('plus').onclick=()=>{zoom=Math.min(2.5,zoom+.15);render()};
  try{pdf=await pdfjs.getDocument({data:decode(${JSON.stringify(pdfBase64)}),isEvalSupported:false}).promise;window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready',pages:pdf.numPages}));await render()}catch(error){viewer.innerHTML='<div class="error">This PDF could not be rendered.</div>';window.ReactNativeWebView.postMessage(JSON.stringify({type:'error'}))}
  </script></body></html>`;
}

export function LocalPdfViewer({ uri }: { uri: string }) {
  const { mode, colors } = useAppTheme();
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [pdfAsset, workerAsset] = await Promise.all([
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          Asset.loadAsync(require('@/assets/pdfjs/pdf.min.txt')),
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          Asset.loadAsync(require('@/assets/pdfjs/pdf.worker.min.txt')),
        ]);
        const pdfUri = pdfAsset[0].localUri || pdfAsset[0].uri;
        const workerUri = workerAsset[0].localUri || workerAsset[0].uri;
        const [pdfModule, workerModule, reportBase64] = await Promise.all([
          new File(pdfUri).text(), new File(workerUri).text(), new File(uri).base64(),
        ]);
        if (active) setHtml(htmlDocument(pdfModule, workerModule, reportBase64, mode === 'dark'));
      } catch { if (active) setError(true); }
    })();
    return () => { active = false; };
  }, [mode, uri]);

  if (error) return <View style={[styles.center, { backgroundColor: colors.background }]}><Text style={{ color: colors.danger }}>The local PDF renderer could not be loaded.</Text></View>;
  if (!html) return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.primary} /><Text style={{ color: colors.textMuted }}>Preparing report viewer…</Text></View>;
  return <WebView source={{ html, baseUrl: 'about:blank' }} style={{ flex: 1, backgroundColor: colors.background }} originWhitelist={['about:blank', 'blob:*']} javaScriptEnabled domStorageEnabled onShouldStartLoadWithRequest={(request) => request.url === 'about:blank'} onMessage={({ nativeEvent }) => { try { if (JSON.parse(nativeEvent.data).type === 'error') setError(true); } catch { /* Ignore non-protocol messages. */ } }} onError={() => setError(true)} />;
}

const styles = StyleSheet.create({ center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 } });
