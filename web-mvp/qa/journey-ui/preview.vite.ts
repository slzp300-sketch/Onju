import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {resolve} from 'node:path'
import {createJourneyBackend} from './backend.mjs'

const backend=createJourneyBackend()
// A local, in-memory simulator for manual UI QA. Never imported by production.
export default defineConfig({
  root:resolve(import.meta.dirname,'../../../logs/sites/onju-web-mvp/web-mvp'),envDir:false,
  define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify('http://127.0.0.1:5190'),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('synthetic-offline-public')},
  plugins:[react(),{name:'offline-journey',
    transformIndexHtml(html){return html.replace('<body>','<body><aside style="position:fixed;bottom:0;right:0;z-index:99999;background:#142e26;color:#fff;padding:3px 8px;font:11px sans-serif;pointer-events:none">OFFLINE QA · simulated replies · $0</aside>')},
    configureServer(server){server.middlewares.use('/functions/v1/',async(req,res)=>{
      res.setHeader('Content-Type','application/json')
      if(req.method!=='POST'){res.statusCode=405;res.end('{}');return}
      let raw=''
      for await(const chunk of req){raw+=chunk;if(raw.length>64_000){res.statusCode=413;res.end('{}');return}}
      try{
        const result=await backend.fetch('http://127.0.0.1:5190/functions/v1/'+req.url?.replace(/^\//,''),{body:raw,headers:{Accept:req.headers.accept}})
        res.statusCode=result.status;res.setHeader('Content-Type',result.headers.get('Content-Type')??'application/json')
        if(result.body){for await(const chunk of result.body as unknown as AsyncIterable<Uint8Array>)res.write(chunk)}
        res.end()
      }catch{res.statusCode=400;res.end(JSON.stringify({error:'unsupported_synthetic_request'}))}
    })},
  }],server:{host:'127.0.0.1',port:5190,strictPort:true},
})
