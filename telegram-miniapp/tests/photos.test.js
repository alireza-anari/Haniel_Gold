import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import nodeCrypto from 'node:crypto';
import app from '../src/index.js';

const bot='test-token-not-real';
function signedData(){
 const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:123456789,first_name:'Test'})});
 const value=[...p].sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>k+'='+v).join('\n');
 const secret=nodeCrypto.createHmac('sha256','WebAppData').update(bot).digest();
 p.set('hash',nodeCrypto.createHmac('sha256',secret).update(value).digest('hex'));
 return p.toString();
}
const jpeg=new Uint8Array(80);jpeg.set([255,216,255,224]);
function mockDatabase(){
 const state={image:null,deleted:false};
 const db={
  prepare(sql){
   let params=[];
   return {
    bind(...args){params=args;return this;},
    async first(){
     if(sql.startsWith('SELECT * FROM products WHERE id='))return {id:42,name:'Test'};
     if(sql.startsWith('SELECT COUNT(*) n FROM images'))return {n:state.image&&!state.deleted?1:0};
     if(sql.startsWith('SELECT mime,image_blob FROM images WHERE id='))return state.image&&!state.deleted?{mime:state.image.mime,image_blob:Array.from(state.image.bytes)}:null;
     if(sql.startsWith('SELECT * FROM images WHERE id='))return state.image&&!state.deleted?{id:7,product_id:42,mime:state.image.mime}:null;
     return null;
    },
    async all(){return {results:[]}},
    async run(){
     if(sql.startsWith('INSERT INTO images(')){
      state.image={mime:params[2],bytes:new Uint8Array(params[3])};
      return {meta:{last_row_id:7,changes:1}};
     }
     if(sql.startsWith('DELETE FROM images'))state.deleted=true;
     return {meta:{last_row_id:1,changes:1}};
    }
   };
  },
  async batch(items){return Promise.all(items.map(s=>s.run()));}
 };
 return {db,state};
}
test('D1 photos upload/get/delete work without R2 binding',async()=>{
 const {db}=mockDatabase(),env={DB:db,BOT_TOKEN:bot,OWNER_TELEGRAM_ID:'123456789'};
 const auth={'X-Telegram-Init-Data':signedData()};
 const data=new FormData();
 data.append('image',new File([jpeg],'test.jpg',{type:'image/jpeg'}));
 const uploaded=await app.fetch(new Request('https://example.workers.dev/api/products/42/images',{method:'POST',headers:auth,body:data}),env,{});
 assert.equal(uploaded.status,201,await uploaded.text());
 const fetched=await app.fetch(new Request('https://example.workers.dev/api/images/7',{headers:auth}),env,{});
 assert.equal(fetched.status,200);
 assert.equal(fetched.headers.get('content-type'),'image/jpeg');
 assert.deepEqual(new Uint8Array(await fetched.arrayBuffer()),jpeg);
 const deleted=await app.fetch(new Request('https://example.workers.dev/api/images/7',{method:'DELETE',headers:auth}),env,{});
 assert.equal(deleted.status,200);
 const missing=await app.fetch(new Request('https://example.workers.dev/api/images/7',{headers:auth}),env,{});
 assert.equal(missing.status,404);
});
test('upload rejects photos over the 400k D1 upload limit',async()=>{
 const {db}=mockDatabase(),env={DB:db,BOT_TOKEN:bot,OWNER_TELEGRAM_ID:'123456789'};
 const oversize=new Uint8Array(400001);oversize.set([255,216,255]);
 const data=new FormData();data.append('image',new File([oversize],'large.jpg',{type:'image/jpeg'}));
 const response=await app.fetch(new Request('https://example.workers.dev/api/products/42/images',{method:'POST',headers:{'X-Telegram-Init-Data':signedData()},body:data}),env,{});
 assert.equal(response.status,413);
});
