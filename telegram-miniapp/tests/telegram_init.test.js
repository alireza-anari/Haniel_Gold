import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const code=readFileSync(new URL('../public/telegram-init.js',import.meta.url),'utf8');
function reader(){
 const sandbox={window:{},URL,URLSearchParams};
 runInNewContext(code,sandbox);
 return sandbox.window.HanielTelegramInit.readRawInitData;
}
const signed='query_id=AA-example&user=%7B%22id%22%3A123%7D&auth_date=1234567890&hash=abc';
test('prefer official Telegram.WebApp.initData when provided',()=>{
 const get=reader();
 assert.equal(get({initData:signed},'https://example.test/#tgWebAppData=attacker'),signed);
});
test('recover raw signed data from Telegram hash when SDK value is empty',()=>{
 const get=reader();
 const href='https://preview.example.test/#tgWebAppData='+encodeURIComponent(signed)+'&tgWebAppVersion=9.0';
 assert.equal(get({initData:''},href),signed);
});
test('recover raw signed data from Telegram query in supported clients',()=>{
 const get=reader();
 assert.equal(get(undefined,'https://preview.example.test/?tgWebAppData='+encodeURIComponent(signed)),signed);
});
test('no SDK and no signed launch data is fail closed',()=>{
 const get=reader();
 assert.equal(get(undefined,'https://preview.example.test/'),'');
 assert.equal(get({initDataUnsafe:{user:{id:123}}},'https://preview.example.test/'),'');
});
test('invalid URL or empty tgWebAppData never fabricates authentication',()=>{
 const get=reader();
 assert.equal(get({initData:''},'not-a-url'),'');
 assert.equal(get(null,'https://example.test/#tgWebAppData='),'');
});
