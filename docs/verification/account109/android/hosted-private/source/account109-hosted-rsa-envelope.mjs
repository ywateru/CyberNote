/** Private RSA envelope factory. Source contains no live credential or key.
 * Private KeyObject and decrypted Buffer remain in this process only.
 * No clipboard fallback, logging of callback data, or automatic retries.
 */
import { generateKeyPair, privateDecrypt, constants } from 'node:crypto';
import { createCredentialTransfer } from '/private/tmp/cybernote-account109-native/scripts/verification/account109-credential-transfer.mjs';
import { prepareConsumer } from './account109-hosted-memory-consumer.mjs';
import { observeTerminal } from './account109-hosted-terminal-observer.mjs';
export async function prepareEnvelope({driver,WebSocketImpl,record,consumeUi:injectedConsumer,observe:injectedObserver}){
 if(typeof record!=='function')throw Error('SAFE_RECORDER_REQUIRED');
 // Trusted offline injections test error boundaries only; live caller uses defaults.
 const consumeUi=injectedConsumer??prepareConsumer(driver);
 const observe=injectedObserver??observeTerminal;
 const safeRecord=async receipt=>{try{await record(receipt);}catch{throw Error('SAFE_RECORDER_FAILED');}};
 let pair=await new Promise((resolve,reject)=>generateKeyPair('rsa',{modulusLength:4096,publicExponent:65537},(error,publicKey,privateKey)=>error?reject(Error('RSA_PREPARATION_FAILED')):resolve({publicKey,privateKey})));
 const publicKeyBase64=pair.publicKey.export({type:'spki',format:'der'}).toString('base64');
 let privateKey=pair.privateKey;pair=undefined;
 const expiresAt=Date.now()+240000;
 let attempted=false;
 const dispose=()=>{privateKey=undefined;attempted=true;clearTimeout(timer);};
 const timer=setTimeout(()=>{privateKey=undefined;attempted=true;},240000);timer.unref?.();
 return{publicKeyBase64,dispose,accept:async(ciphertextBase64,marker)=>{
  if(attempted||!privateKey||Date.now()>=expiresAt)return{phase:'encrypted-transfer-rejected',code:'ENVELOPE_EXPIRED_OR_CONSUMED'};
  attempted=true;let plaintext,ciphertext;let stage='envelope';
  try{
   if(typeof ciphertextBase64!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(ciphertextBase64))throw Error('ENVELOPE_INVALID');
   ciphertext=Buffer.from(ciphertextBase64,'base64');
   if(ciphertext.length!==512||ciphertext.toString('base64')!==ciphertextBase64)throw Error('ENVELOPE_INVALID');
   plaintext=privateDecrypt({key:privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},ciphertext);privateKey=undefined;
   if(plaintext.length>446||Date.now()>=expiresAt)throw Error('ENVELOPE_INVALID');
   stage='transfer';let inputCompleted=false;
   const transfer=createCredentialTransfer({read:()=>plaintext,captured:receipt=>safeRecord(receipt),consume:async data=>{
    const expiry=typeof data.expiresAt==='number'?(data.expiresAt<1e12?data.expiresAt*1000:data.expiresAt):Date.parse(data.expiresAt);
    if(expiry>expiresAt||Date.now()>=expiresAt)throw Error('ENVELOPE_EXPIRED');
    await consumeUi(data,{deadline:expiresAt});inputCompleted=true;
    await safeRecord({phase:'hosted-submit-input-dispatched',inputCompleted:true,valuesRecorded:false});
   }});
   const helperReceipt=await transfer(marker);
   // Release plaintext before polling the independently observed terminal state.
   plaintext.fill(0);plaintext=undefined;
   const terminal=inputCompleted?await observe({WebSocketImpl}):{phase:'no-submit-input-observed'};
   return{helper:helperReceipt,terminal};
  }catch{return{phase:'encrypted-transfer-rejected',code:stage==='envelope'?'ENVELOPE_REJECTED':'TRANSFER_OR_CONSUMER_REJECTED'};}
  finally{privateKey=undefined;plaintext?.fill(0);ciphertext?.fill(0);plaintext=undefined;ciphertext=undefined;clearTimeout(timer);}
 }};
}
