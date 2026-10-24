import assert from 'node:assert/strict';
import { WalletChallengeStore } from '../server/wallet_auth_challenges';

type AuthChallenge={message:string;used:boolean;expiresAt:number;address:string};
const store=new WalletChallengeStore<AuthChallenge>(3,3);
const now=1_800_000_000;
const mk=(message:string):AuthChallenge=>({message,used:false,expiresAt:now+300,address:'wallet'});
store.issue('browser-A',mk('bots request'),now);
store.issue('browser-A',mk('main wallet request'),now);
store.issue('browser-B',mk('bots request'),now);

assert.equal(store.consume('browser-A','bots request',now+1).message,'bots request',
  'A second signing request must not overwrite an existing unspent challenge');
assert.equal(store.consume('browser-A','main wallet request',now+2).message,'main wallet request');
assert.throws(()=>store.consume('browser-A','bots request',now+2),/challenge_replayed/,
  'The same signed message must never be verified twice');
assert.equal(store.consume('browser-B','bots request',now+2).message,'bots request',
  'Challenges must remain isolated per browser session');
assert.throws(()=>store.consume('browser-B','main wallet request',now+2),/challenge_missing_or_superseded/,
  'A challenge from another session must not authorize this browser');

const tooOld=mk('expired');
tooOld.expiresAt=now-1;
store.issue('browser-C',tooOld,now-2);
assert.throws(()=>store.consume('browser-C','expired',now),/challenge_expired/);

store.issue('browser-C',mk('1'),now);
store.issue('browser-C',mk('2'),now);
store.issue('browser-C',mk('3'),now);
store.issue('browser-C',mk('4'),now);
assert.throws(()=>store.consume('browser-C','1',now),/challenge_missing_or_superseded/,
  'Memory-bounded challenge store must discard oldest pending messages');
assert.equal(store.consume('browser-C','4',now).message,'4');
store.prune(now+301);
assert.throws(()=>store.consume('browser-C','4',now+302),/challenge_missing_or_superseded/);
console.log('PASS: independent concurrent SIWE requests, one-time signatures, session isolation, expiry and challenge caps.');
