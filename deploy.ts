import {
    bsv,
    TestWallet,
    DefaultProvider,
    toHex,
    ByteString,
    sha256,
    Sha256,
} from 'scrypt-ts'
import { HelloWorld } from './src/contracts/helloWorld'
import helloWorldArtifact from './artifacts/helloWorld.json'
import * as dotenv from 'dotenv'
dotenv.config()

async function main() {
    const privateKeyWIF = process.env.PRIVATE_KEY
    if (!privateKeyWIF) {
        throw new Error('PRIVATE_KEY is not set in .env!')
    }

    const privateKey = bsv.PrivateKey.fromWIF(privateKeyWIF)
    const provider = new DefaultProvider({ network: bsv.Networks.testnet })
    const signer = new TestWallet(privateKey, provider)

    // 1) Load
    await HelloWorld.loadArtifact(helloWorldArtifact)

    // 2) Convert "Hello World!" to hex bytes
    const asciiMsg: ByteString = toHex(Buffer.from('Hello World!'))

    // 3) Actually compute the real 32-byte SHA-256 of those bytes
    const expectedHash: Sha256 = sha256(asciiMsg)

    console.log('asciiMsg:', asciiMsg)
    console.log('expectedHash:', expectedHash)

    // 4) Instantiate your contract with the real hash
    const instance = new HelloWorld(expectedHash)
    await instance.connect(signer)

    // 5) Deploy
    const deployTx = await instance.deploy(50)
    console.log('Deployed HelloWorld! TXID:', deployTx.id)

    // 6) Optionally call `unlock` right here
    //    Provide the same ASCII message in hex form
    //const { tx: callTx } = await instance.methods.unlock(asciiMsg)
    //console.log('Unlocked in same script. TXID:', callTx.id)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
