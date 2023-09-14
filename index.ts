import * as ethers from 'ethers'
import * as Discord from 'discord.js'
import { address, abi } from './CollectionManager'
import { MANAAbi, MANAAddress } from './MANA'
import BigNumber from 'bignumber.js'
import { Telegraf } from 'telegraf'

const telegramBot = new Telegraf(process.env.TELEGRAM_API_TOKEN!)

const client = new Discord.Client({ intents: [Discord.GatewayIntentBits.Guilds] })

client.on('ready', () => {
  console.log(`Logged in as ${client.user!.tag}!`)

  void provider.on({ topics: ['0xcfaab0d6675a72a93c114f48dd85add1076be0c88545968759ef034da7ad146f'] }, async (log) => {
    const proxyAddress = new ethers.AbiCoder().decode(['address'], log.topics[1])
    const receipts = await provider.getTransactionReceipt(log.transactionHash)
    if (!receipts) return
    const transferFees = receipts.logs.find((l) => l.topics.includes('0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'))
    const manaTransfer = MANAcontract.interface.decodeEventLog(MANAcontract.getEvent('Transfer').fragment, transferFees!.data)

    if (receipts.to!.toLowerCase() == address) {
      const tx = await provider.getTransaction(log.transactionHash)
      if (!tx) return
      const res = await decodeFunctionData(tx.data, proxyAddress.toString(), new BigNumber(manaTransfer[2]).dividedBy(new BigNumber(10).pow(18)))
      if (res) await postToAll(res)
    } else {
      const metaTx = receipts.logs.find((l) => l.topics.includes('0x5845892132946850460bff5a0083f71031bc5bf9aadcd40f1de79423eac9b10b'))
      if (!metaTx) return
      // decode function data
      const decoded = contract.interface.decodeEventLog(contract.getEvent('MetaTransactionExecuted').fragment, metaTx.data)
      const res = await decodeFunctionData(decoded[2], proxyAddress.toString(), new BigNumber(manaTransfer[2]).dividedBy(new BigNumber(10).pow(18)))
      if (res) await postToAll(res)
    }
  })
  /*   void provider
    .getLogs({
      topics: ['0xcfaab0d6675a72a93c114f48dd85add1076be0c88545968759ef034da7ad146f'],
      fromBlock: 47463380,
      toBlock: 47463390
    })
    .then(async (logs) => {
      for (const log of logs) {
        const proxyAddress = new ethers.AbiCoder().decode(['address'], log.topics[1])
        const receipts = await provider.getTransactionReceipt(log.transactionHash)
        if (!receipts) continue
        const transferFees = receipts.logs.find((l) => l.topics.includes('0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'))
        const manaTransfer = MANAcontract.interface.decodeEventLog(MANAcontract.getEvent('Transfer').fragment, transferFees!.data)

        if (receipts.to!.toLowerCase() == address) {
          const tx = await provider.getTransaction(log.transactionHash)
          if (!tx) continue
          const res = await decodeFunctionData(tx.data, proxyAddress.toString(), new BigNumber(manaTransfer[2]).dividedBy(new BigNumber(10).pow(18)))
          if (res) await postToAll(res)
        } else {
          continue
          const metaTx = receipts.logs.find((l) => l.topics.includes('0x5845892132946850460bff5a0083f71031bc5bf9aadcd40f1de79423eac9b10b'))
          if (!metaTx) continue
          // decode function data
          const decoded = contract.interface.decodeEventLog(contract.getEvent('MetaTransactionExecuted').fragment, metaTx.data)
          const res = await decodeFunctionData(decoded[2], proxyAddress.toString(), new BigNumber(manaTransfer[2]).dividedBy(new BigNumber(10).pow(18)))
          if (res) await postToDiscord(res)
        }
      }
    })
 */
})

void client.login(process.env.DISCORD_API_TOKEN!)

// initialize ethers provider
const provider = new ethers.JsonRpcProvider('https://rpc.ankr.com/polygon', 137, { polling: true })
const contract = new ethers.Contract(address, abi, provider)
const MANAcontract = new ethers.Contract(MANAAddress, MANAAbi, provider)

// post to discord
async function postToDiscord(collection: Collection) {
  const channel = (await client.channels.fetch('1151633983046684793')) as Discord.TextChannel
  await channel.send({ embeds: [...(await createEmbeds(collection))] })
}

// decode function data
async function decodeFunctionData(data: string, proxyAddress: string, fee: BigNumber): Promise<Collection> {
  const f = contract.getFunction('createCollection')
  //  provider.getLogs({})
  const res = contract.interface.decodeFunctionData(f.fragment, data)
  return {
    address: proxyAddress,
    name: res[3],
    symbol: res[4],
    fee: fee,
    creator: res[6],
    items: res[7].map((item: any) => {
      return {
        rarity: item[0],
        price: +ethers.formatEther(item[1]),
        beneficiary: item[2],
        metadata: item[3]
      }
    })
  }
}

async function createEmbeds(collection: Collection) {
  const embed = new Discord.EmbedBuilder()
    .setTitle(`Collection "${collection.name}"`)
    .setDescription(
      `Symbol: ${collection.symbol}\nCreator: ${collection.creator}\n\nFees: ${collection.fee.toFixed(0)} MANA\nFees paid to curators: ${collection.fee
        .multipliedBy(0.3)
        .toFixed(2)} MANA`
    )
    .setColor('#00ff00')

  const itemsEmbed = await Promise.all(
    collection.items.map(async (item, index) => {
      const img = await fetchWearable(collection.address, index)

      return new Discord.EmbedBuilder()
        .setTitle(capitalizeFirstLetter(item.metadata.split(':')[2]))
        .setThumbnail(`https://decentralandjhsbujg3-image.functions.fnc.fr-par.scw.cloud/${img}.png`)
        .addFields(
          { name: 'Rarity', value: capitalizeFirstLetter(item.rarity), inline: true },
          { name: 'Price', value: `${item.price} MANA`, inline: true },
          { name: 'Metadata', value: `\`${item.metadata}\``, inline: false }
        )
        .setColor('#ff0000')
    })
  )

  return [embed, ...itemsEmbed]
}

// fetch wearable from catalyst
async function fetchWearable(collectionAddress: string, itemId: number) {
  const res = await fetch(
    `https://peer.decentraland.org/content/entities/wearables?pointer=urn:decentraland:matic:collections-v2:${collectionAddress.toLowerCase()}:${itemId}`
  )
  const json = await res.json()
  return json[0].content.find((file: any) => file.file == 'thumbnail.png').hash
}

interface Collection {
  address: string
  name: string
  symbol: string
  fee: BigNumber
  creator: string
  items: Item[]
}

interface Item {
  rarity: string
  price: string
  beneficiary: string
  metadata: string
}

function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1)
}

async function postToTelegram(collection: Collection) {
  await telegramBot.telegram.sendMessage(
    '-1001911850353',
    `New collection: ${collection.name}\n(${collection.symbol})\n${collection.items.length} item${
      collection.items.length > 1 ? 's' : ''
    }\n\nFees: ${collection.fee.toFixed(0)} MANA\nFees paid to curators: ${collection.fee.multipliedBy(0.3).toFixed(2)} MANA`
  )
}

async function postToAll(collection: Collection) {
  await Promise.all([postToDiscord(collection), postToTelegram(collection)])
}

void telegramBot.launch()
