import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const start=source.indexOf('const latinDigits='),end=source.indexOf('const isManager=',start);
assert.ok(start>=0&&end>start,'UI numeric helpers must exist');
const context={FormData:class {}};
vm.createContext(context);
vm.runInContext(source.slice(start,end)+'\nthis.format={number,formatTypedNumber,latinDigits};',context);
const {number,formatTypedNumber}=context.format;

test('Persian financial figures use visible comma grouping and round display only',()=>{
 assert.equal(number('1234567890.5',0),'۱,۲۳۴,۵۶۷,۸۹۱');
 assert.equal(number('1234567890.49',0),'۱,۲۳۴,۵۶۷,۸۹۰');
 assert.equal(number('-1000000.5',0),'-۱,۰۰۰,۰۰۱');
 assert.equal(number('0.49999',0),'۰');
});
test('large amounts retain integer precision beyond JavaScript safe integers',()=>{
 assert.equal(number('9007199254740993.00',0),'۹,۰۰۷,۱۹۹,۲۵۴,۷۴۰,۹۹۳');
});
test('gold weights keep up to four fractional digits and are grouped',()=>{
 assert.equal(number('1234.56789',4),'۱,۲۳۴.۵۶۷۹');
 assert.equal(number('0.00005',4),'۰.۰۰۰۱');
 assert.equal(number('12',4),'۱۲');
});
test('formatted editing accepts Persian digits, comma grouping and decimals',()=>{
 assert.equal(formatTypedNumber('۱۲۳۴۵۶۷٫۸۰'),'۱,۲۳۴,۵۶۷.۸۰');
 assert.equal(formatTypedNumber('1234567'),'۱,۲۳۴,۵۶۷');
 assert.equal(formatTypedNumber('۱۲,۳۴۵.۶'),'۱۲,۳۴۵.۶');
 assert.equal(formatTypedNumber('1234.'),'۱,۲۳۴.');
});
