// unlock.ts

import { bsv, TestWallet, DefaultProvider, toHex, ByteString } from 'scrypt-ts'
import { HelloWorld } from './src/contracts/helloWorld'
import artifact from './artifacts/helloWorld.json'
import * as dotenv from 'dotenv'
dotenv.config()

// 1) Change these to match YOUR on-chain contract:
const TXID = '3992d6325dbc296b5eb7e65b9adad81a6689415eb4fe59ff7f95eeb5b4611a5d'
const OUTPUT_INDEX = 0 // usually 0 if you only have one contract output
// Must match the exact same ASCII string from deployment
const CORRECT_MESSAGE_STRING = 'Hello World!'

async function main() {
    // 2) Load your private key from .env
    const privateKeyWIF = process.env.PRIVATE_KEY
    if (!privateKeyWIF) {
        throw new Error('PRIVATE_KEY is not set in .env!')
    }

    // 3) Create provider & signer for testnet
    const privateKey = bsv.PrivateKey.fromWIF(privateKeyWIF)
    const provider = new DefaultProvider({ network: bsv.Networks.testnet })
    const signer = new TestWallet(privateKey, provider)

    // 4) Load compiled artifact
    await HelloWorld.loadArtifact(artifact)

    // 5) Fetch the on-chain transaction & reconstruct contract instance
    const onChainTx = await signer.connectedProvider.getTransaction(TXID)
    const instance = HelloWorld.fromTx(onChainTx, OUTPUT_INDEX)

    // 6) Connect the signer
    await instance.connect(signer)

    // 7) Encode the same message you used at deployment into a ByteString
    const correctMsg: ByteString = toHex(Buffer.from(CORRECT_MESSAGE_STRING))

    // 8) Call the `unlock` method to spend the contract
    const { tx: callTx } = await instance.methods.unlock(correctMsg, {})

    console.log('✅ Contract unlocked (spent) on testnet.')
    console.log(`   Spent TXID: ${callTx.id}`)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
