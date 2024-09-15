import algosdk from 'algosdk'
import { ASSET_IDs, FUNDING_ACCOUNT, TEMP_ACCOUNT } from './constants/index.js'
import {
	fmtCurrency,
	getAccount,
	getAssetsByAccount,
	getAvailBal,
	handleBatchOptIn,
	handleBatchOptOut,
	transferAlgo,
} from './utils/index.js'

const init = async () => {
	// Prepare the accounts
	const fundingAccount = await getAccount(FUNDING_ACCOUNT)
	const tempAccount = await getAccount(TEMP_ACCOUNT)

	// Display the intended addresses
	console.log({
		fundingAccount: fundingAccount.addr,
		tempAccount: tempAccount.addr,
	})

	// Retrieve available balances in micro units (actual algo balance - minimum balance - 0.001)
	const fundingAvailBalance = await getAvailBal(fundingAccount.addr)
	const tempAvailBalance = await getAvailBal(tempAccount.addr)

	// Format the balance values
	const fmtFundingAvailBalance = await fmtCurrency(0, fundingAvailBalance, 6)
	const fmtTempAvailBalance = await fmtCurrency(0, tempAvailBalance, 6)

	// Display the available balances
	console.log({
		fundingAvailBalance: fmtFundingAvailBalance,
		tempAvailBalance: fmtTempAvailBalance,
	})

	// Get the assets currently opted-in by the temp account
	const tempAssets = await getAssetsByAccount({
		address: tempAccount.addr,
		withBalance: false,
	})

	// Display the opted-in assets of the temp account
	console.log(
		JSON.stringify({
			tempAssets: tempAssets.length,
			assetIDs: ASSET_IDs.length,
		})
	)

	// Retrieve the assets yet to be opted-in by the temp account from the list of assets available
	const yetToOptIn = await handleBatchOptIn({
		assets: ASSET_IDs,
		account: tempAccount,
		handleOptIn: false,
	})

	// Calculate the amount required for the asset MBR, opt-in and opt-out transactions
	const optInAmount = yetToOptIn.length * 0.102

	// If the temp account's available balance isn't sufficient, then the funding account tops it up with the required amount
	if (optInAmount > fmtTempAvailBalance) {
		const remaining = optInAmount - fmtTempAvailBalance
		console.log({ remaining })
		await transferAlgo({
			fromAddress: fundingAccount.addr,
			toAddress: tempAccount.addr,
			amount: remaining,
			key: algosdk.secretKeyToMnemonic(fundingAccount.sk),
			note: 'wallet top-up',
		})
	}

	// The batch opt-in is initiated
	const batchOptIn = await handleBatchOptIn({
		assets: ASSET_IDs,
		account: tempAccount,
	})

	// Display the result of the batch opt-in
	console.log(
		JSON.stringify(
			{
				success: batchOptIn.success,
				assets: batchOptIn?.assets.length,
				optIns: batchOptIn?.optIns.length,
			},
			null,
			2
		)
	)

	// Retrieve the current available balance of the temp account in micro units
	const tempAvailBalance_ = await getAvailBal(tempAccount.addr)

	// Format the balance value
	const fmtTempAvailBalance_ = await fmtCurrency(0, tempAvailBalance_, 6)

	// Display the available balance
	console.log({
		tempAvailBalanceAfterOptIns: fmtTempAvailBalance_,
	})

	// Proceed to perform batch opt-out of all provided assets
	const { optOuts, assets, success } = await handleBatchOptOut({
		assets: ASSET_IDs,
		account: tempAccount,
	})

	// Diplay the result of the operation
	console.log(
		JSON.stringify(
			{ success, assets: assets.length, optOuts: optOuts.length },
			null,
			2
		)
	)

	// Retrieve the current available balance of the temp account
	const tempAvailBalance__ = await getAvailBal(tempAccount.addr)

	// Format the balance value
	const fmtTempAvailBalance__ = await fmtCurrency(0, tempAvailBalance__, 6)

	// Display the available balance
	console.log({
		tempAvailBalanceAfterOptOuts: fmtTempAvailBalance__,
	})

	// If the temp account has more than 2 algo, the excess is refunded to the funding account
	if (fmtTempAvailBalance__ > 2)
		await transferAlgo({
			fromAddress: tempAccount.addr,
			toAddress: fundingAccount.addr,
			amount: (2 - fmtTempAvailBalance__ + 0.001) * -1,
			key: algosdk.secretKeyToMnemonic(tempAccount.sk),
			note: 'wallet refund',
		})

	// Retrieve the current available balance of the temp account
	const tempAvailBalance___ = await getAvailBal(tempAccount.addr)

	// Format the balance value
	const fmtTempAvailBalance___ = await fmtCurrency(0, tempAvailBalance___, 6)

	// Display the available balance
	console.log({
		tempAvailBalanceAfterRefund: fmtTempAvailBalance___,
	})

	// Retrieve the finalized assets list of the temp account
	const tempAssets_ = await getAssetsByAccount({
		address: tempAccount.addr,
		withBalance: false,
	})

	// Display the finalized assets list of the temp account
	console.log(
		JSON.stringify({
			tempAssets: tempAssets_.length,
			assetIDs: ASSET_IDs.length,
		})
	)
}

init()
