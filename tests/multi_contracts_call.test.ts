import {
    MethodCallOptions,
    SmartContract,
    bsv,
    ContractTransaction,
    toByteString,
    sha256,
} from 'scrypt-ts'
import { AdvancedCounter } from '../src/contracts/advancedCounter'
import { getDefaultSigner } from './utils/helper'
import { expect } from 'chai'
import { HashLock } from '../src/contracts/hashLock'

describe('Test SmartContract `AdvancedCounter, HashLock` multi call on local', () => {
    before(() => {
        AdvancedCounter.loadArtifact()
        HashLock.loadArtifact()
    })

    it('should succeed', async () => {
        const signer = getDefaultSigner()
        const counter1 = new AdvancedCounter(1n)

        // connect to a signer
        await counter1.connect(signer)
        await counter1.deploy(1)

        counter1.bindTxBuilder(
            'incrementOnChain',
            (
                current: AdvancedCounter,
                options: MethodCallOptions<AdvancedCounter>,
                ...args: any
            ): Promise<ContractTransaction> => {
                // create the next instance from the current
                const nextInstance = current.next()
                // apply updates on the next instance locally
                nextInstance.count++

                const tx = new bsv.Transaction()
                tx.addInput(current.buildContractInput()).addOutput(
                    new bsv.Transaction.Output({
                        script: nextInstance.lockingScript,
                        satoshis: current.balance,
                    })
                )

                return Promise.resolve({
                    tx: tx,
                    atInputIndex: 0,
                    nexts: [
                        {
                            instance: nextInstance,
                            balance: current.balance,
                            atOutputIndex: 0,
                        },
                    ],
                })
            }
        )

        const plainText = 'abc'
        const byteString = toByteString(plainText, true)
        const sha256Data = sha256(byteString)

        const hashPuzzle = new HashPuzzle(sha256Data)

        // connect to a signer
        await hashLock.connect(signer)

        await hashLock.deploy(1)

        hashLock.bindTxBuilder(
            'unlock',
            (
                current: HashLock,
                options: MethodCallOptions<HashLock>,
                ...args: any
            ): Promise<ContractTransaction> => {
                if (options.partialContractTx) {
                    const unSignedTx = options.partialContractTx.tx
                    unSignedTx.addInput(current.buildContractInput())

                    return Promise.resolve({
                        tx: unSignedTx,
                        atInputIndex: 1,
                        nexts: [],
                    })
                }

                throw new Error('no partialContractTx found')
            }
        )

        const partialTx = await counter1.methods.incrementOnChain({
            multiContractCall: true,
        } as MethodCallOptions<AdvancedCounter>)

        const finalTx = await hashLock.methods.unlock(byteString, {
            multiContractCall: true,
            partialContractTx: partialTx,
        } as MethodCallOptions<HashLock>)

        const callContract = async () =>
            SmartContract.multiContractCall(finalTx, signer)

        return expect(callContract()).not.rejected
    })
})
