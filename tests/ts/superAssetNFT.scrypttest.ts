import { expect } from 'chai';
import { buildContractClass, signTx, toHex, bsv, Ripemd160, PubKey, Sig, Bytes, VerifyResult, Bool, getPreimage, num2bin} from 'scryptlib';
import { compileContract, newTx, sighashType2Hex } from "../../helper";
const crypto = require('crypto');
/**
 * an example SuperAssetNFT test for contract containing signature verification
 */
const privateKey = bsv.PrivateKey.fromRandom('testnet')
const publicKey = privateKey.publicKey
const pkh = bsv.crypto.Hash.sha256ripemd160(publicKey.toBuffer())
const privateKey2 = bsv.PrivateKey.fromRandom('testnet')

const MSB_THRESHOLD = 0x7e;
const Signature = bsv.crypto.Signature;
const sighashType = Signature.SIGHASH_ANYONECANPAY | Signature.SIGHASH_SINGLE | Signature.SIGHASH_FORKID;

const dummyTxId = '8709ff8d2452897beacabc174e06654b6b1753116c44e37924c7cc1e0c93732d';
const reversedDummyTxId =  Buffer.from(dummyTxId, 'hex').reverse().toString('hex');

const inputSatoshis = 10000;
function newTx() {
  const utxo = {
    txId: dummyTxId,
    outputIndex: 0,
    script: '',   // placeholder
    satoshis: inputSatoshis
  };
  return new bsv.Transaction().from(utxo);
}

function buildNFTMintMetadataOpReturn() {
  return bsv.Script.fromASM(`OP_FALSE OP_RETURN ${Buffer.from("Image: https://i1.sndcdn.com/artworks-000299901567-oiw8tq-t500x500.jpg", 'utf8').toString('hex')}`);
}
/**
 * Replace the asset and PKH arguments of the locking script.
 * @param {*} asm The locking script as generated by scrypt compiler
 * @param {*} asset The assetid
 * @param {*} pkh the pubKeyHash
 */
 function replaceAssetAndPkh(asm, asset, pkh) {
  const replacedAssetPkh = asset + ' ' + pkh + asm.toASM().substring(113); 
  return bsv.Script.fromASM(replacedAssetPkh);
}

function generatePreimage(isOpt, tx, lockingScriptASM, satValue, sighashType, idx = 0) {
  let preimage: any = null;
  if (isOpt) {
    for (let i = 0; ; i++) {
      // malleate tx and thus sighash to satisfy constraint
      tx.nLockTime = i;
      const preimage_ = getPreimage(tx, lockingScriptASM, satValue, idx, sighashType);
      let preimageHex = toHex(preimage_);
      preimage = preimage_;
      const h = bsv.crypto.Hash.sha256sha256(Buffer.from(preimageHex, 'hex'));
      const msb = h.readUInt8();
      if (msb < MSB_THRESHOLD) {
        // the resulting MSB of sighash must be less than the threshold
        break;
      }
    }
  } else {
    preimage = getPreimage(tx, lockingScriptASM, satValue, idx, sighashType);
  }
  return preimage;
}

describe('Test sCrypt contract SuperAssetNFT In Typescript', () => {
  const outputSize = 'fc'; // Change to fc for debug or f2 for release
  before(() => {
  });

  it('signature check should succeed when right private key signs', () => {
    const SuperAssetNFT = buildContractClass(compileContract('SuperAssetNFT.scrypt'));
    const publicKeyHash = bsv.crypto.Hash.sha256ripemd160(publicKey.toBuffer());
    let nft = new SuperAssetNFT(Bytes('000000000000000000000000000000000000000000000000000000000000000000000000'), Ripemd160(toHex(publicKeyHash)));
    const asmVars = {
      'Tx.checkPreimageOpt_.sigHashType': 
      sighashType2Hex(sighashType)
    };  
    let tx: any = newTx();
    nft.replaceAsmVars(asmVars);
    nft.txContext = {
      tx,
      inputIndex: 0,
      inputSatoshis 
    }

    const assetId = reversedDummyTxId + '00000000';

    const newLockingScript = replaceAssetAndPkh(nft.lockingScript, assetId, privateKey.toAddress().toHex().substring(2));  
    tx 
    .setOutput(0, (tx) => {
      return new bsv.Transaction.Output({
        script: newLockingScript,
        satoshis: inputSatoshis,
      });
    })
    // Add another output to show that SIGHASH_SINGLE will ignore it
    .setOutput(1, (tx) => {
      const deployData = buildNFTMintMetadataOpReturn()
      return new bsv.Transaction.Output({
        script: deployData,
        satoshis: 0,
      }) 
    })
    const receiveAddressWithSize = Bytes('14' + privateKey.toAddress().toHex().substring(2));
    const outputSatsWithSize = Bytes(num2bin(BigInt(inputSatoshis), 8) + `${outputSize}24`);
    const preimage = generatePreimage(true, tx, nft.lockingScript, inputSatoshis, sighashType);
    let sig = signTx(tx, privateKey, nft.lockingScript, inputSatoshis, 0, sighashType)

    let result = nft.unlock(
      preimage,
      outputSatsWithSize,
      receiveAddressWithSize,
      Bool(false),
      Sig(toHex(sig)),
      PubKey(toHex(publicKey))).verify()
    expect(result.success, result.error).to.be.true
  });

  it('signature check should fail when wrong private key signs', () => {
    const SuperAssetNFT = buildContractClass(compileContract('SuperAssetNFT.scrypt'));
    const publicKeyHash = bsv.crypto.Hash.sha256ripemd160(publicKey.toBuffer());
    let nft = new SuperAssetNFT(Bytes('000000000000000000000000000000000000000000000000000000000000000000000000'), Ripemd160(toHex(publicKeyHash)));
    const asmVars = {
      'Tx.checkPreimageOpt_.sigHashType': 
      sighashType2Hex(sighashType)
    };  
    let tx: any = newTx();
    nft.replaceAsmVars(asmVars);
    nft.txContext = {
      tx,
      inputIndex: 0,
      inputSatoshis 
    }
    const assetId = reversedDummyTxId + '00000000';
    const newLockingScript = replaceAssetAndPkh(nft.lockingScript, assetId, privateKey.toAddress().toHex().substring(2));  
    tx 
    .setOutput(0, (tx) => {
      return new bsv.Transaction.Output({
        script: newLockingScript,
        satoshis: inputSatoshis,
      });
    })
    const receiveAddressWithSize = Bytes('14' + privateKey.toAddress().toHex().substring(2));
    const outputSatsWithSize = Bytes(num2bin(BigInt(inputSatoshis), 8) + `${outputSize}24`);
    const preimage = generatePreimage(true, tx, nft.lockingScript, inputSatoshis, sighashType);
    let sig = signTx(tx, privateKey2, nft.lockingScript, inputSatoshis, 0, sighashType)
    let result = nft.unlock(
      preimage,
      outputSatsWithSize,
      receiveAddressWithSize,
      Bool(false),
      Sig(toHex(sig)),
      PubKey(toHex(publicKey))).verify()
    expect(result.success, result.error).to.be.false
  }); 

  it('should fail when non-SIGHASH_SINGLE flag is used when there are other outputs', () => {
    const SuperAssetNFT = buildContractClass(compileContract('SuperAssetNFT.scrypt'));
    const publicKeyHash = bsv.crypto.Hash.sha256ripemd160(publicKey.toBuffer());
    let nft = new SuperAssetNFT(Bytes('000000000000000000000000000000000000000000000000000000000000000000000000'), Ripemd160(toHex(publicKeyHash)));
    const sighashTypeNotSighashSingle = Signature.SIGHASH_ANYONECANPAY | Signature.SIGHASH_ALL| Signature.SIGHASH_FORKID;
    const asmVars = {
      'Tx.checkPreimageOpt_.sigHashType': 
      sighashType2Hex(sighashTypeNotSighashSingle)
    };  
    let tx: any = newTx();
    nft.replaceAsmVars(asmVars);
    nft.txContext = {
      tx,
      inputIndex: 0,
      inputSatoshis 
    }
    const assetId = reversedDummyTxId + '00000000';
    const newLockingScript = replaceAssetAndPkh(nft.lockingScript, assetId, privateKey.toAddress().toHex().substring(2));  
    tx 
    .setOutput(0, (tx) => {
      return new bsv.Transaction.Output({
        script: newLockingScript,
        satoshis: inputSatoshis,
      });
    })
    .setOutput(1, (tx) => {
      const deployData = buildNFTMintMetadataOpReturn()
      return new bsv.Transaction.Output({
        script: deployData,
        satoshis: 0,
      }) 
    })
    const receiveAddressWithSize = Bytes('14' + privateKey.toAddress().toHex().substring(2));
    const outputSatsWithSize = Bytes(num2bin(BigInt(inputSatoshis), 8) + `${outputSize}24`);
    const preimage = generatePreimage(true, tx, nft.lockingScript, inputSatoshis, sighashTypeNotSighashSingle);
    let sig = signTx(tx, privateKey, nft.lockingScript, inputSatoshis, 0, sighashTypeNotSighashSingle)
    let result = nft.unlock(
      preimage,
      outputSatsWithSize,
      receiveAddressWithSize,
      Bool(false),
      Sig(toHex(sig)),
      PubKey(toHex(publicKey))).verify()
    expect(result.success, result.error).to.be.false
  }); 
  it('should allow arbitrary change when isTransform is true', () => {
    const SuperAssetNFT = buildContractClass(compileContract('SuperAssetNFT.scrypt'));
    const publicKeyHash = bsv.crypto.Hash.sha256ripemd160(publicKey.toBuffer());
    let nft = new SuperAssetNFT(Bytes('000000000000000000000000000000000000000000000000000000000000000000000000'), Ripemd160(toHex(publicKeyHash)));
    const asmVars = {
      'Tx.checkPreimageOpt_.sigHashType': 
      sighashType2Hex(sighashType)
    };  
    let tx: any = newTx();
    nft.replaceAsmVars(asmVars);
    nft.txContext = {
      tx,
      inputIndex: 0,
      inputSatoshis 
    }
    tx 
    .setOutput(0, (tx) => {
      const deployData = buildNFTMintMetadataOpReturn()
      return new bsv.Transaction.Output({
        script: deployData,
        satoshis: 0,
      }) 
    })
    .setOutput(1, (tx) => {
      const deployData = buildNFTMintMetadataOpReturn()
      return new bsv.Transaction.Output({
        script: deployData,
        satoshis: 10,
      }) 
    })
    const receiveAddressWithSize = Bytes('14' + privateKey.toAddress().toHex().substring(2));
    const outputSatsWithSize = Bytes(num2bin(BigInt(inputSatoshis), 8) + `${outputSize}24`);
    const preimage = generatePreimage(true, tx, nft.lockingScript, inputSatoshis, sighashType);
    let sig = signTx(tx, privateKey, nft.lockingScript, inputSatoshis, 0, sighashType)
    let result = nft.unlock(
      preimage,
      outputSatsWithSize,
      receiveAddressWithSize,
      Bool(true),
      Sig(toHex(sig)),
      PubKey(toHex(publicKey))).verify()
    expect(result.success, result.error).to.be.true
  });

  it('signature check should succeed when right private key signs (after mint)', () => {
    const SuperAssetNFT = buildContractClass(compileContract('SuperAssetNFT.scrypt'));
    const publicKeyHash = bsv.crypto.Hash.sha256ripemd160(publicKey.toBuffer());
    let nft = new SuperAssetNFT(Bytes('0a0000000000000000000000000000000000000000000000000000000000000000000001'), Ripemd160(toHex(publicKeyHash)));
    const asmVars = {
      'Tx.checkPreimageOpt_.sigHashType': 
      sighashType2Hex(sighashType)
    };  
    let tx: any = newTx();
    nft.replaceAsmVars(asmVars);
    nft.txContext = {
      tx,
      inputIndex: 0,
      inputSatoshis 
    }

    const assetId = '0a0000000000000000000000000000000000000000000000000000000000000000000001';

    const newLockingScript = replaceAssetAndPkh(nft.lockingScript, assetId, privateKey.toAddress().toHex().substring(2));  
    tx 
    .setOutput(0, (tx) => {
      return new bsv.Transaction.Output({
        script: newLockingScript,
        satoshis: inputSatoshis,
      });
    })
    // Add another output to show that SIGHASH_SINGLE will ignore it
    .setOutput(1, (tx) => {
      const deployData = buildNFTMintMetadataOpReturn()
      return new bsv.Transaction.Output({
        script: deployData,
        satoshis: 0,
      }) 
    })
    const receiveAddressWithSize = Bytes('14' + privateKey.toAddress().toHex().substring(2));
    const outputSatsWithSize = Bytes(num2bin(BigInt(inputSatoshis), 8) + `${outputSize}24`);
    const preimage = generatePreimage(true, tx, nft.lockingScript, inputSatoshis, sighashType);
    let sig = signTx(tx, privateKey, nft.lockingScript, inputSatoshis, 0, sighashType)
    let result = nft.unlock(
      preimage,
      outputSatsWithSize,
      receiveAddressWithSize,
      Bool(false),
      Sig(toHex(sig)),
      PubKey(toHex(publicKey))).verify()
    expect(result.success, result.error).to.be.true
  });
  it('op_verify should fail when provided with the wrong pkh in the constructor', () => {
    const SuperAssetNFT = buildContractClass(compileContract('SuperAssetNFT.scrypt'));
    const publicKeyHash = bsv.crypto.Hash.sha256ripemd160(publicKey.toBuffer());
    let nft = new SuperAssetNFT(Bytes('0a0000000000000000000000000000000000000000000000000000000000000000000001'), Ripemd160('4f3c913a459603496db9399aa12c8c9fc7f74932'));
    const asmVars = {
      'Tx.checkPreimageOpt_.sigHashType': 
      sighashType2Hex(sighashType)
    };  
    let tx: any = newTx();
    nft.replaceAsmVars(asmVars);
    nft.txContext = {
      tx,
      inputIndex: 0,
      inputSatoshis 
    }
    const assetId = '0a0000000000000000000000000000000000000000000000000000000000000000000001';
    const newLockingScript = replaceAssetAndPkh(nft.lockingScript, assetId, privateKey.toAddress().toHex().substring(2));  
    tx 
    .setOutput(0, (tx) => {
      return new bsv.Transaction.Output({
        script: newLockingScript,
        satoshis: inputSatoshis,
      });
    })
    // Add another output to show that SIGHASH_SINGLE will ignore it
    .setOutput(1, (tx) => {
      const deployData = buildNFTMintMetadataOpReturn()
      return new bsv.Transaction.Output({
        script: deployData,
        satoshis: 0,
      }) 
    })
    const receiveAddressWithSize = Bytes('14' + privateKey.toAddress().toHex().substring(2));
    const outputSatsWithSize = Bytes(num2bin(BigInt(inputSatoshis), 8) + `${outputSize}24`);
    const preimage = generatePreimage(true, tx, nft.lockingScript, inputSatoshis, sighashType);
    let sig = signTx(tx, privateKey, nft.lockingScript, inputSatoshis, 0, sighashType)
    let result = nft.unlock(
      preimage,
      outputSatsWithSize,
      receiveAddressWithSize,
      Bool(false),
      Sig(toHex(sig)),
      PubKey(toHex(publicKey))).verify()
    expect(result.success, result.error).to.be.false
  });
});