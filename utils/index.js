import algosdk from 'algosdk'
import { NETWORK } from '../constants/index.js'

const algodServer = `https://${NETWORK}-api.algonode.cloud`
const indexerServer = `https://${NETWORK}-idx.algonode.cloud`
// Base URL for the NF Domains API on testnet

const port = 443
const token = ''

const algodClient = new algosdk.Algodv2(token, algodServer, port)

const indexerClient = new algosdk.Indexer(token, indexerServer, port)

export const getAssetsByAccount = async ({
	address,
	blacklist = [],
	withBalance = true,
	withAmount = false,
	closableAssets = false,
} = {}) => {
	if (!address) return []
	try {
		let account_assets = []
		let nextToken = ''
		do {
			const res = await indexerClient
				.lookupAccountAssets(address)
				.nextToken(nextToken)
				.do()
			account_assets = account_assets.concat(res['assets'])
			nextToken = res['next-token']
		} while (nextToken)
		if (!account_assets.length) {
			return []
		}

		const data = []
		const noneRedeemable = {}
		blacklist.forEach((e) => {
			noneRedeemable[e] = e
		})

		const len = account_assets.length
		for (let i = 0; i < len; i++) {
			const asset = account_assets[i]
			const asset_id = asset['asset-id']
			const is_deleted = asset['deleted']
			const amount = asset['amount']
			if (
				!is_deleted &&
				!noneRedeemable[asset_id] &&
				(withBalance ? (closableAssets ? amount === 0 : amount) : true)
			) {
				data.push(withAmount ? { asset_id, amount } : asset_id)
			}
		}
		return data
	} catch (err) {
		// console.log(err)
		return []
	}
}

export const createAccount = () => {
	try {
		const account = algosdk.generateAccount()
		const address = account.addr
		const mnemonic = algosdk.secretKeyToMnemonic(account.sk)
		return { address, mnemonic }
	} catch (error) {
		console.log(error)
		throw error
	}
}

export const getAccount = async (key) => {
	try {
		const account = algosdk.mnemonicToSecretKey(key)
		return account
	} catch (error) {
		console.log(error)
		throw error
	}
}

export const getAccountInfo = async (address) => {
	try {
		const accountInfo = await algodClient.accountInformation(address).do()
		return accountInfo
	} catch (error) {
		console.log(error)
		throw error
	}
}

export const transferAlgo = async ({
	fromAddress,
	toAddress,
	amount,
	key,
	note = '',
}) => {
	try {
		const account = await getAccount(key)
		const suggestedParams = await algodClient.getTransactionParams().do()

		const txnParams = {
			from: fromAddress,
			to: toAddress,
			amount: Math.round(amount * 10 ** 6), // Ensure the amount is rounded to the nearest integer
			suggestedParams: suggestedParams,
		}

		// Add a unique identifier to the note
		const uniqueNote = `${note} | #${Date.now()}-${Math.random()}`
		if (uniqueNote) {
			txnParams['note'] = new Uint8Array(Buffer.from(uniqueNote, 'utf8'))
		}

		const ptxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject(txnParams)
		const signedTxn = ptxn.signTxn(account.sk)
		await algodClient.sendRawTransaction(signedTxn).do()
		let txId = ptxn.txID().toString()
		await algosdk.waitForConfirmation(algodClient, txId, 4) // Use a shorter wait time
		return txId
	} catch (error) {
		console.log(error)
		throw error
	}
}

export const getBalance = async (id = 0, wallet = '') => {
	if (!wallet) return 0
	id = Number(id)
	const algodAccountInfo = await algodClient.accountInformation(wallet).do()

	const indexerAccountInfo = {}
	let account_assets = []
	let nextToken = ''
	do {
		const res = await indexerClient
			.lookupAccountAssets(wallet)
			.nextToken(nextToken)
			.do()
		account_assets = account_assets.concat(res['assets'])
		nextToken = res['next-token']
	} while (nextToken)
	indexerAccountInfo['assets'] = account_assets

	const indexerAccountCreatedInfo = {}
	let account_assets_ = []
	let nextToken_ = ''
	do {
		const res = await indexerClient
			.lookupAccountCreatedAssets(wallet)
			.nextToken(nextToken_)
			.do()
		account_assets_ = account_assets_.concat(res['assets'])
		nextToken_ = res['next-token']
	} while (nextToken_)
	indexerAccountCreatedInfo['assets'] = account_assets_

	if (id === 0 && algodAccountInfo?.['amount'] !== undefined) {
		return algodAccountInfo?.['amount'] ?? 0
	} else if (algodAccountInfo?.['created-assets'].length) {
		const balance = id
			? algodAccountInfo?.['created-assets']
					.filter((el) => Number(el['asset-id']) === Number(id))
					.map((el) => Number(el.amount))?.[0] ?? 0
			: algodAccountInfo?.['amount']
		if (balance) return balance
	} else if (indexerAccountCreatedInfo?.assets.length) {
		const balance = id
			? indexerAccountCreatedInfo?.['assets']
					.filter((el) => Number(el['asset-id']) === Number(id))
					.map((el) => Number(el.amount))?.[0] ?? 0
			: algodAccountInfo?.['amount'] ?? 0
		if (balance) return balance
	}

	if (algodAccountInfo?.['assets'].length) {
		const balance = id
			? algodAccountInfo?.['assets']
					.filter((el) => Number(el['asset-id']) === Number(id))
					.map((el) => el?.['amount'])?.[0] ?? 0
			: algodAccountInfo?.['amount']
		return balance
	} else if (indexerAccountInfo?.assets.length) {
		const balance = id
			? indexerAccountInfo?.['assets']
					.filter((el) => Number(el['asset-id']) === Number(id))
					.map((el) => el?.['amount'])?.[0] ?? 0
			: algodAccountInfo?.['amount'] ?? 0
		return balance
	} else {
		return 0
	}
}

export const getAssetInfo = async (assetIndex) => {
	assetIndex = Number(assetIndex)
	if (assetIndex === 0)
		return {
			success: true,
			decimals: 6,
			name: 'ALGO',
			unit: 'ALGO',
			index: assetIndex,
		}
	try {
		const assetInfo = await indexerClient.lookupAssetByID(assetIndex).do()
		return {
			index: assetInfo?.asset?.index ?? assetIndex,
			deleted: assetInfo?.asset?.deleted ?? true,
			'created-at-round': assetInfo?.asset?.['created-at-round'],
			...((assetInfo?.asset ?? {})?.params ?? {}),
			unit: ((assetInfo?.asset ?? {})?.params ?? {})?.['unit-name'] ?? '',
		}
	} catch (error) {
		console.log(error)
		throw error
	}
}

export const parseCurrency = async (tok, amt, dec = null) => {
	const { decimals = 0 } =
		dec !== null ? { decimals: dec } : await getAssetInfo(tok)
	const power = 10 ** Number(decimals)
	const newAmt = amt * power
	const secondHalf = String(newAmt % 1).length - 2
	if (secondHalf) {
		return Math.ceil(newAmt)
	}
	return Number(newAmt)
}

export const fmtCurrency = async (tok, amt, dec = null) => {
	const { decimals = 0 } =
		dec !== null ? { decimals: dec } : await getAssetInfo(tok)
	const power = 10 ** Number(decimals)
	const newAmt = amt / power
	return Number(newAmt)
}

export const getMinimumBal = async (address) => {
	const algodAccountInfo = await algodClient.accountInformation(address).do()

	if (algodAccountInfo?.['min-balance'])
		return algodAccountInfo?.['min-balance']
	else return 0
}

export const getAvailBal = async (address) => {
	const actualBal = await getBalance(0, address)
	const minimumBal = await getMinimumBal(address)
	const availBal = Math.round(actualBal - minimumBal - 1000)
	return availBal
}

export const handleBatchOptIn = async ({
	assets,
	account,
	handleOptIn = true,
}) => {
	const userAssets = await getAssetsByAccount({
		address: account.addr,
		withBalance: false,
	})
	const uAssetsObj = {}
	userAssets.map((el) => {
		uAssetsObj[el] = el
	})

	const yetToOptIn = assets.filter((el) => !uAssetsObj[el])

	if (!handleOptIn) {
		return yetToOptIn
	}

	if (!yetToOptIn?.length)
		return {
			success: true,
			optIns: [],
			assets,
		}
	let optedInAssets = []
	const algoBal = (await getBalance(0, account.addr)) / 10 ** 6
	const minimumBal = (await getMinimumBal(account.addr)) / 10 ** 6
	console.log({
		resultingBal: algoBal - (minimumBal + yetToOptIn?.length * 0.101),
	})
	if (algoBal < minimumBal + yetToOptIn?.length * 0.101) {
		return {
			success: false,
			optIns: [],
			assets,
		}
	}
	const waitRoundsToConfirm = 8
	const suggestedParams = await algodClient.getTransactionParams().do()
	let processedTxns = []
	let txID = ''
	try {
		const assetLength = yetToOptIn?.length
		const hops = Math.ceil(assetLength / 1000)
		let hop = 1
		while (hop <= hops) {
			const point = (hop - 1) * 1000
			const end = hop * 1000
			const stop = end > assetLength ? assetLength : end
			const batch = yetToOptIn.slice(point, stop)
			const batchLen = batch.length
			const steps = Math.ceil(batchLen / 16)
			let step = 1
			const wrapperTxns = []
			while (step <= steps) {
				const point = (step - 1) * 16
				const end = step * 16
				const stop = end > batchLen ? batchLen : end
				let i = point
				const txns = []
				while (i < stop) {
					try {
						const uniqueNote = `Asset opt-in transaction initiated by Aro1914 | #${Date.now()}-${Math.random()}.`
						const user_aXferTxn =
							algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
								from: account.addr,
								to: account.addr,
								assetIndex: batch[i],
								suggestedParams,
								note: new Uint8Array(Buffer.from(uniqueNote)),
								amount: 0,
							})
						txns.push(user_aXferTxn)
					} catch (err) {
						console.error(err)
					}
					i++
				}
				const txnGroup = algosdk.assignGroupID(txns, account.addr)
				// const lenLen = txnGroup.length
				// const encodedTxns = []
				// let ii = 0
				// while (ii < lenLen) {
				// 	encodedTxns.push(algosdk.encodeUnsignedTransaction(txnGroup[ii]))
				// 	ii++
				// }
				wrapperTxns.push(txnGroup)
				step++
			}
			let xTxn = 0
			const xTxnLen = wrapperTxns.length
			for (xTxn; xTxn < xTxnLen; xTxn++) {
				const txns = wrapperTxns[xTxn]
				const { txId } = await algodClient
					.sendRawTransaction(
						await Promise.all(txns.map((txn) => txn.signTxn(account.sk)))
					)
					.do()
				txID = txId
				await algosdk.waitForConfirmation(
					algodClient,
					txns?.[0].txID().toString() ?? txId,
					waitRoundsToConfirm
				)
			}
			optedInAssets = processedTxns.concat(batch)
			hop++
		}
		return {
			success: true,
			txID,
			optIns: processedTxns,
			assets,
		}
	} catch (err) {
		console.error(err)
		return {
			success: false,
			optIns: processedTxns,
			assets,
		}
	}
}

export const handleBatchOptOut = async ({
	assets = [],
	account,
	handleOptOut = true,
	useAssets = true,
}) => {
	const userAssets = await getAssetsByAccount({
		address: account.addr,
		withBalance: false,
		closableAssets: true,
	})
	const uAssetsObj = {}
	userAssets.map((el) => {
		uAssetsObj[el] = el
	})

	const yetToOptOut = (useAssets ? assets : userAssets).filter(
		(el) => uAssetsObj[el]
	)

	if (!handleOptOut) {
		return yetToOptOut
	}

	if (!yetToOptOut?.length)
		return {
			success: true,
			optOuts: [],
			assets,
		}
	const algoBal = (await getBalance(0, account.addr)) / 10 ** 6
	const minimumBal = (await getMinimumBal(account.addr)) / 10 ** 6
	if (algoBal < minimumBal + yetToOptOut?.length * 0.001) {
		return {
			success: false,
			optOuts: [],
			assets,
		}
	}
	const waitRoundsToConfirm = 8
	const suggestedParams = await algodClient.getTransactionParams().do()
	let processedTxns = []
	let txID = ''
	try {
		const assetLength = yetToOptOut?.length
		const hops = Math.ceil(assetLength / 1000)
		let hop = 1
		while (hop <= hops) {
			const point = (hop - 1) * 1000
			const end = hop * 1000
			const stop = end > assetLength ? assetLength : end
			const batch = yetToOptOut.slice(point, stop)
			const batchLen = batch.length
			const steps = Math.ceil(batchLen / 16)
			let step = 1
			const wrapperTxns = []
			while (step <= steps) {
				const point = (step - 1) * 16
				const end = step * 16
				const stop = end > batchLen ? batchLen : end
				let i = point
				const txns = []
				while (i < stop) {
					try {
						const uniqueNote = `Asset opt-out transaction initiated by Aro1914 | #${Date.now()}-${Math.random()}.`
						const creator = (await getAssetInfo(batch[i]))?.creator ?? ''
						const user_aXferTxn =
							algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
								from: account.addr,
								to: creator,
								assetIndex: batch[i],
								suggestedParams,
								closeRemainderTo: creator,
								note: new Uint8Array(Buffer.from(uniqueNote)),
							})
						txns.push(user_aXferTxn)
					} catch (err) {
						console.error(err)
					}
					i++
				}
				const txnGroup = algosdk.assignGroupID(txns, account.addr)
				// const lenLen = txnGroup.length
				// const encodedTxns = []
				// let ii = 0
				// while (ii < lenLen) {
				// 	encodedTxns.push(algosdk.encodeUnsignedTransaction(txnGroup[ii]))
				// 	ii++
				// }
				wrapperTxns.push(txnGroup)
				step++
			}
			let xTxn = 0
			const xTxnLen = wrapperTxns.length
			for (xTxn; xTxn < xTxnLen; xTxn++) {
				const txns = wrapperTxns[xTxn]
				const { txId } = await algodClient
					.sendRawTransaction(
						await Promise.all(txns.map((txn) => txn.signTxn(account.sk)))
					)
					.do()
				txID = txId
				await algosdk.waitForConfirmation(
					algodClient,
					txns?.[0].txID().toString() ?? txId,
					waitRoundsToConfirm
				)
			}
			processedTxns = processedTxns.concat(batch)
			hop++
		}
		return {
			success: true,
			txID,
			optOuts: processedTxns,
			assets,
		}
	} catch (err) {
		console.error(err)
		return {
			success: false,
			optOuts: processedTxns,
			assets,
		}
	}
}

export const optOut = async (assetId, account) => {
	try {
		// Get the current balance of the asset in the wallet
		const assetBalance = await getBalance(assetId, account.addr)

		// Check if the balance is not 0
		if (assetBalance !== 0) {
			console.log(`Cannot opt out. Asset balance (${assetBalance}) is not 0.`)
			return false // Return falsy value to indicate opt-out refusal
		}

		// Proceed with the opt-out transaction
		const assetInfo = await getAssetInfo(assetId)
		const creator = assetInfo?.creator
		const suggestedParams = await algodClient.getTransactionParams().do()
		const opOutTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
			from: account.addr,
			to: creator,
			assetIndex: assetId,
			suggestedParams,
			closeRemainderTo: creator,
		})
		const signedTxn = opOutTxn.signTxn(account.sk)
		await algodClient.sendRawTransaction(signedTxn).do()
		let txId = opOutTxn.txID().toString()
		const result = await algosdk.waitForConfirmation(algodClient, txId, 4)
		return txId
	} catch (error) {
		console.log(error)
		throw error
	}
}
