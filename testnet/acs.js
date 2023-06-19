/**
 * Testnet deployment for AnyoneCanSpend contract in JavaScript
 **/
const {
  bsv,
  buildContractClass,
  getPreimage,
  toHex,
  Ripemd160,
  SigHashPreimage,
} = require('scryptlib');
const {
  loadDesc,
  sendTx,
  showError,
  deployContract
} = require('../helper');

(async () => {
  const Signature = bsv.crypto.Signature;

  const privateKeyX = new bsv.PrivateKey.fromRandom('testnet');
  console.log(`Private key generated: '${privateKeyX.toWIF()}'`);

  const publicKeyX = bsv.PublicKey.fromPrivateKey(privateKeyX);
  const publicKeyHashX = bsv.crypto.Hash.sha256ripemd160(publicKeyX.toBuffer());
  const addressX = privateKeyX.toAddress();

  const amount = 2000;

  try {
    // initialize contract
    const AnyoneCanSpend = buildContractClass(loadDesc('acs'));
    const acs = new AnyoneCanSpend(new Ripemd160(toHex(publicKeyHashX)));

    // deploy contract on testnet
    const lockingTx = await deployContract(acs, amount);
    console.log('funding txid:      ', lockingTx.id);

    // call contract method on testnet
    const newLockingScript = bsv.Script.buildPublicKeyHashOut(addressX);

    const unlockingTx = new bsv.Transaction();
    unlockingTx.addInputFromPrevTx(lockingTx)
      .setOutput(0, (tx) => {
        return new bsv.Transaction.Output({
          script: newLockingScript,
          satoshis: amount - tx.getEstimateFee(),
        })
      })
      .setInputScript({
        inputIndex: 0,
        sigtype: Signature.SIGHASH_ANYONECANPAY | Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID
      }, (tx) => {
        const outputAmount = tx.outputs[0].satoshis;

        return acs
          .unlock(new SigHashPreimage(tx.getPreimage(0)), outputAmount)
          .toScript();
      })
      .seal()

    const unlockingTxid = await sendTx(unlockingTx);
    console.log('unlocking txid:   ', unlockingTxid);

    console.log('Succeeded on testnet');
  } catch (error) {
    console.log('Failed on testnet');
    showError(error);
  }
})();