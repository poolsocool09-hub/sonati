const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ChannelType
} = require("discord.js")
const axios = require("axios")
const fs = require("fs")
const http = require("http")
const path = require("path")

// ===================== CONSTANTS =====================
const TMONEY_ICON = "https://www.truemoney.com/wp-content/uploads/2020/01/favicon.png"
const WALLET_EMOJI = "💳"
const SUCCESS_EMOJI = "✅"
const ERROR_EMOJI = "❌"
const SHOP_BANNER = "https://i.imgur.com/your-banner.png"
const QR_IMAGE = "https://media.discordapp.net/attachments/1481694978483814421/1482351370198847488/image.png?ex=69b6a2cb&is=69b5514b&hm=a81c034725942a7f76a5f0dfa482cdf2cd31dbd1b4bda54b2bce5cac18a4ac17&=&format=webp&quality=lossless&width=712&height=965"

// ===================== CONFIG (Environment Variables) =====================
const TOKEN = process.env.DISCORD_TOKEN || "YOUR_TOKEN_HERE"
const CLIENT_ID = process.env.CLIENT_ID || "YOUR_CLIENT_ID"
const OWNER_ID = process.env.OWNER_ID || "YOUR_OWNER_ID"
const TOPUP_CHANNEL = process.env.TOPUP_CHANNEL || "YOUR_CHANNEL_ID"
const SLIPOK_URL = process.env.SLIPOK_URL || "https://api.slipok.com/api/line/apikey/62613"
const SLIPOK_KEY = process.env.SLIPOK_KEY || "YOUR_SLIPOK_KEY"
const YOUR_PHONE_NUMBER = process.env.PHONE_NUMBER || "YOUR_PHONE"
const PORT = process.env.PORT || 3000

// ===================== CUSTOMER ROLE CONFIG =====================
// ยศลูกค้าที่จะให้เมื่อเติมเงิน (ใส่ Role ID ที่ต้องการ)
const CUSTOMER_ROLE_ID = process.env.CUSTOMER_ROLE_ID || "YOUR_CUSTOMER_ROLE_ID"

// ===================== FORUM CHANNEL CONFIG =====================
// Forum Channel สำหรับโพสต์ ID สินค้า
const FORUM_CHANNEL_ID = process.env.FORUM_CHANNEL_ID || "YOUR_FORUM_CHANNEL_ID"

// ===================== UPDATE STOCK CHANNEL CONFIG =====================
// ห้องสำหรับแจ้งเตือนการอัปเดต stock (เมื่อมีการซื้อสินค้า)
const UPDATE_STOCK_CHANNEL = process.env.UPDATE_STOCK_CHANNEL || "YOUR_UPDATE_STOCK_CHANNEL_ID"

// ===================== DATABASE PATH =====================
const DB_DIR = path.join(__dirname, "database")

// สร้างโฟลเดอร์ database ถ้ายังไม่มี
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true })
  console.log("📁 สร้างโฟลเดอร์ database สำเร็จ")
}

// ===================== COLORS =====================
const COLORS = {
  PRIMARY: 0x5865F2,
  SUCCESS: 0x57F287,
  WARNING: 0xFEE75C,
  ERROR: 0xED4245,
  GOLD: 0xFFD700,
  PURPLE: 0x9B59B6,
  CYAN: 0x00D9FF
}

// ===================== CLIENT =====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
})

// ===================== HTTP SERVER (สำหรับ Render Health Check) =====================
const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({
      status: "ok",
      bot: client.user ? client.user.tag : "starting...",
      uptime: process.uptime()
    }))
  } else {
    res.writeHead(404)
    res.end("Not Found")
  }
})

server.listen(PORT, () => {
  console.log(`🌐 HTTP Server running on port ${PORT}`)
})

// ===================== HELPER FUNCTIONS =====================
function loadJSON(filePath, defaultValue) {
  try {
    const fullPath = filePath.startsWith("./database/")
      ? path.join(DB_DIR, path.basename(filePath))
      : filePath
    return JSON.parse(fs.readFileSync(fullPath, "utf8"))
  } catch {
    return defaultValue
  }
}

function saveJSON(filePath, data) {
  const fullPath = filePath.startsWith("./database/")
    ? path.join(DB_DIR, path.basename(filePath))
    : filePath
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2))
}

function formatMoney(amount) {
  return amount.toLocaleString('th-TH')
}

function createDivider() {
  return "━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

// ===================== ฟังก์ชันให้ยศลูกค้า =====================
async function giveCustomerRole(guild, userId) {
  try {
    if (!CUSTOMER_ROLE_ID || CUSTOMER_ROLE_ID === "YOUR_CUSTOMER_ROLE_ID") {
      console.log("⚠️ ยังไม่ได้ตั้งค่า CUSTOMER_ROLE_ID")
      return false
    }

    const member = await guild.members.fetch(userId).catch(() => null)
    if (!member) {
      console.log(`⚠️ ไม่พบสมาชิก ${userId}`)
      return false
    }

    const role = guild.roles.cache.get(CUSTOMER_ROLE_ID)
    if (!role) {
      console.log(`⚠️ ไม่พบยศ ${CUSTOMER_ROLE_ID}`)
      return false
    }

    if (member.roles.cache.has(CUSTOMER_ROLE_ID)) {
      console.log(`ℹ️ ${member.user.tag} มียศลูกค้าอยู่แล้ว`)
      return true
    }

    await member.roles.add(role)
    console.log(`✅ ให้ยศลูกค้าแก่ ${member.user.tag} สำเร็จ`)
    return true
  } catch (error) {
    console.error("❌ ไม่สามารถให้ยศลูกค้าได้:", error)
    return false
  }
}

// ===================== ฟังก์ชันสร้าง Forum Thread =====================
async function createForumThread(guild, productName, minecraftName, product) {
  try {
    if (!FORUM_CHANNEL_ID || FORUM_CHANNEL_ID === "YOUR_FORUM_CHANNEL_ID") {
      console.log("⚠️ ยังไม่ได้ตั้งค่า FORUM_CHANNEL_ID")
      return null
    }

    const forumChannel = guild.channels.cache.get(FORUM_CHANNEL_ID)
    if (!forumChannel || forumChannel.type !== ChannelType.GuildForum) {
      console.log(`⚠️ ไม่พบ Forum Channel หรือไม่ใช่ Forum Channel: ${FORUM_CHANNEL_ID}`)
      return null
    }

    // สร้าง embed สำหรับ Forum Thread
    const embed = new EmbedBuilder()
      .setAuthor({
        name: "SONATI SELLER",
        iconURL: TMONEY_ICON
      })
      .setTitle(`🛒 ${productName}`)
      .setDescription(
        `${createDivider()}\n\n` +
        `> 💰 **ราคา:** \`${formatMoney(product.price)} บาท\`\n` +
        `> 🎭 **ผ้าคลุม:** ${product.cloak}\n` +
        `> ⭐ **แรงค์:** ${product.rank}\n` +
        `${createDivider()}\n\n` +
        `📝 **รายละเอียด:**\n` +
        `\`\`\`${product.detail}\`\`\`\n` +
        `${createDivider()}`
      )
      .setImage(`https://visage.surgeplay.com/full/512/${productName}`)
      .setColor(COLORS.SUCCESS)
      .setFooter({ text: "🟢 พร้อมขาย • Sonati Seller", iconURL: TMONEY_ICON })
      .setTimestamp()

    // สร้างปุ่มซื้อและเติมเงิน
    const buyButton = new ButtonBuilder()
      .setCustomId(`buy_${productName}`)
      .setLabel(`ซื้อ ${productName}`)
      .setStyle(ButtonStyle.Success)
      .setEmoji("🛒")

    const topupButton = new ButtonBuilder()
      .setCustomId("show_topup_options")
      .setLabel("เติมเงิน")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("💰")

    const row = new ActionRowBuilder().addComponents(buyButton, topupButton)

    // สร้าง Forum Thread ด้วยชื่อสินค้า
    const thread = await forumChannel.threads.create({
      name: `IGN : ${productName}`,
      message: {
        embeds: [embed],
        components: [row]
      },
      reason: `สร้าง ID สินค้า: ${productName}`
    })

    console.log(`✅ สร้าง Forum Thread สำเร็จ: ${thread.name} (ID: ${thread.id})`)
    return thread.id

  } catch (error) {
    console.error("❌ ไม่สามารถสร้าง Forum Thread ได้:", error)
    return null
  }
}

// ===================== ฟังก์ชันอัปเดต Forum Thread เมื่อขาย =====================
async function markForumThreadAsSold(guild, threadId, productName, minecraftName) {
  try {
    if (!threadId) {
      console.log("⚠️ ไม่มี Thread ID")
      return false
    }

    const thread = guild.channels.cache.get(threadId) || await guild.channels.fetch(threadId).catch(() => null)

    if (!thread) {
      console.log(`⚠️ ไม่พบ Thread: ${threadId}`)
      return false
    }

    // เปลี่ยนชื่อเป็น SOLD + ชื่อสินค้า
    await thread.setName(`SOLD : ${productName}`)
    console.log(`✅ เปลี่ยนชื่อ Thread เป็น SOLD : ${productName}`)

    // อัปเดต embed และปุ่มใน thread
    try {
      // ดึง starter message ของ Forum Thread
      const firstMessage = await thread.fetchStarterMessage().catch(async () => {
        // fallback: ถ้า fetchStarterMessage ไม่ทำงาน ลองดึงแบบปกติ
        const messages = await thread.messages.fetch({ limit: 10 })
        return messages.last() // ข้อความแรกสุด (เก่าสุด)
      })

      if (firstMessage && firstMessage.embeds && firstMessage.embeds.length > 0) {
        const soldEmbed = new EmbedBuilder()
          .setAuthor({
            name: "SONATI SELLER",
            iconURL: TMONEY_ICON
          })
          .setTitle(`🛒 ${productName}`)
          .setDescription(
            `${createDivider()}\n\n` +
            `🔴 **สถานะ:** ขายแล้ว`
          )
          .setImage(`https://visage.surgeplay.com/full/512/${productName}`)
          .setColor(COLORS.ERROR)
          .setFooter({ text: "🔴 ขายแล้ว • Sonati Seller", iconURL: TMONEY_ICON })
          .setTimestamp()

        // สร้างปุ่ม disable
        const soldButton = new ButtonBuilder()
          .setCustomId(`sold_${productName}`)
          .setLabel("ขายแล้ว")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("🔴")
          .setDisabled(true)

        const topupButton = new ButtonBuilder()
          .setCustomId("show_topup_options")
          .setLabel("เติมเงิน")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("💰")

        const row = new ActionRowBuilder().addComponents(soldButton, topupButton)

        await firstMessage.edit({ embeds: [soldEmbed], components: [row] })
      }
    } catch (msgError) {
      console.log("⚠️ ไม่สามารถอัปเดต embed ใน thread:", msgError)
    }

    // Close (Archive) Thread
    await thread.setArchived(true)
    console.log(`✅ Close Thread สำเร็จ: ${threadId}`)

    return true

  } catch (error) {
    console.error("❌ ไม่สามารถอัปเดต Forum Thread ได้:", error)
    return false
  }
}

// ===================== SLASH COMMANDS SETUP =====================
const commands = [
  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("📦 แสดงสินค้าทั้งหมดหรือสินค้าที่เลือก")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("ห้องที่ต้องการส่ง panel (ไม่ใส่ = ห้องปัจจุบัน)")
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName("product")
        .setDescription("ชื่อสินค้าที่ต้องการแสดง (ไม่ใส่ = แสดงทั้งหมด)")
        .setRequired(false)
        .setAutocomplete(true)
    ),

  new SlashCommandBuilder()
    .setName("createproduct")
    .setDescription("🆕 สร้างสินค้าใหม่พร้อมเพิ่ม stock")
    .addStringOption(option =>
      option.setName("name").setDescription("ชื่อสินค้า").setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName("price").setDescription("ราคา (บาท)").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("cloak").setDescription("ผ้าคลุม").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("rank").setDescription("แรงค์").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("detail").setDescription("รายละเอียด").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("account").setDescription("ไอดี:รหัส (stock สินค้า)").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("addstock")
    .setDescription("📥 เพิ่ม stock สินค้า")
    .addStringOption(option =>
      option
        .setName("product")
        .setDescription("ชื่อสินค้า")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName("account").setDescription("ไอดี:รหัส").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("💰 เช็คยอดเงินของคุณ"),

  new SlashCommandBuilder()
    .setName("stock")
    .setDescription("📊 เช็คจำนวน stock สินค้า")
    .addStringOption(option =>
      option
        .setName("product")
        .setDescription("ชื่อสินค้า")
        .setRequired(false)
        .setAutocomplete(true)
    ),

  new SlashCommandBuilder()
    .setName("qr")
    .setDescription("🏦 แสดง QR Code สำหรับเติมเงิน"),

  // ===================== คำสั่งใหม่: addmoney =====================
  new SlashCommandBuilder()
    .setName("addmoney")
    .setDescription("💵 เพิ่มเงินให้ผู้ใช้ (Owner Only)")
    .addUserOption(option =>
      option.setName("user").setDescription("ผู้ใช้ที่ต้องการเพิ่มเงิน").setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName("amount").setDescription("จำนวนเงินที่ต้องการเพิ่ม").setRequired(true).setMinValue(1)
    ),

  // ===================== คำสั่งใหม่: removemoney =====================
  new SlashCommandBuilder()
    .setName("removemoney")
    .setDescription("💸 ลบเงินจากผู้ใช้ (Owner Only)")
    .addUserOption(option =>
      option.setName("user").setDescription("ผู้ใช้ที่ต้องการลบเงิน").setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName("amount").setDescription("จำนวนเงินที่ต้องการลบ").setRequired(true).setMinValue(1)
    )
]

// ===================== REGISTER COMMANDS =====================
async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN)

  try {
    console.log("🔄 กำลังลงทะเบียน Slash Commands...")

    await rest.put(Routes.applicationCommands(CLIENT_ID), {
      body: commands.map(cmd => cmd.toJSON())
    })

    console.log("✅ ลงทะเบียน Slash Commands สำเร็จ!")
  } catch (error) {
    console.error("❌ ลงทะเบียน Slash Commands ล้มเหลว:", error)
  }
}

// ===================== READY =====================
client.once("ready", async () => {
  console.log(`✅ BOT ONLINE: ${client.user.tag}`)
  await registerCommands()
})

// ===================== AUTOCOMPLETE =====================
client.on("interactionCreate", async interaction => {
  if (!interaction.isAutocomplete()) return

  const products = loadJSON("./database/products.json", [])
  const focused = interaction.options.getFocused().toLowerCase()

  const filtered = products
    .filter(p => p.name.toLowerCase().includes(focused))
    .slice(0, 25)
    .map(p => ({ name: p.name, value: p.name }))

  await interaction.respond(filtered)
})

// ===================== SLASH COMMAND HANDLER =====================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return

  const { commandName, user } = interaction

  // ===================== /qr =====================
  if (commandName === "qr") {
    const embed = new EmbedBuilder()
      .setAuthor({ name: "SONATI SELLER", iconURL: TMONEY_ICON })
      .setTitle("🏦 QR Code เติมเงิน")
      .setDescription(
        `${createDivider()}\n\n` +
        `📱 **สแกน QR Code เพื่อโอนเงิน**\n\n` +
        `> 💳 **ช่องทาง:** พร้อมเพย์ / ธนาคาร\n` +
        `> 📝 **หลังโอน:** แนบสลิปที่ห้อง <#${TOPUP_CHANNEL}>\n\n` +
        `${createDivider()}\n\n` +
        `⚠️ *โอนแล้วอย่าลืมแนบสลิปนะครับ!*`
      )
      .setImage(QR_IMAGE)
      .setColor(COLORS.PRIMARY)
      .setFooter({ text: "Sonati Seller • ระบบเติมเงินอัตโนมัติ", iconURL: TMONEY_ICON })
      .setTimestamp()

    return interaction.reply({ embeds: [embed] })
  }

  // ===================== /balance =====================
  if (commandName === "balance") {
    const wallet = loadJSON("./database/wallet.json", {})
    const money = wallet[user.id] || 0

    const embed = new EmbedBuilder()
      .setAuthor({ name: "💰 กระเป๋าเงินของคุณ", iconURL: user.displayAvatarURL() })
      .setDescription(
        `${createDivider()}\n\n` +
        `> 💵 **ยอดเงินคงเหลือ**\n` +
        `> \`\`\`${formatMoney(money)} บาท\`\`\`\n\n` +
        `${createDivider()}`
      )
      .setColor(COLORS.GOLD)
      .setThumbnail(user.displayAvatarURL({ size: 128 }))
      .setFooter({ text: "Sonati Seller • ระบบเติมเงินอัตโนมัติ" })
      .setTimestamp()

    return interaction.reply({ embeds: [embed], ephemeral: true })
  }

  // ===================== /stock =====================
  if (commandName === "stock") {
    const products = loadJSON("./database/products.json", [])
    const stock = loadJSON("./database/stock.json", {})
    const productName = interaction.options.getString("product")

    if (productName) {
      const count = stock[productName]?.length || 0
      const statusEmoji = count > 0 ? "🟢" : "🔴"

      const embed = new EmbedBuilder()
        .setTitle("📦 Stock สินค้า")
        .setDescription(
          `**${productName}**\n` +
          `${statusEmoji} คงเหลือ: **${count}** ชิ้น`
        )
        .setColor(count > 0 ? COLORS.SUCCESS : COLORS.ERROR)
        .setTimestamp()

      return interaction.reply({ embeds: [embed], ephemeral: true })
    }

    let stockList = products.map(p => {
      const count = stock[p.name]?.length || 0
      const statusEmoji = count > 0 ? "🟢" : "🔴"
      return `${statusEmoji} **${p.name}** — \`${count} ชิ้น\``
    }).join("\n") || "*ยังไม่มีสินค้า*"

    const embed = new EmbedBuilder()
      .setTitle("📊 Stock ทั้งหมด")
      .setDescription(`${createDivider()}\n\n${stockList}\n\n${createDivider()}`)
      .setColor(COLORS.PRIMARY)
      .setFooter({ text: "Sonati Seller" })
      .setTimestamp()

    return interaction.reply({ embeds: [embed], ephemeral: true })
  }

  // ===================== OWNER ONLY COMMANDS =====================
  if (["panel", "createproduct", "addstock", "addmoney", "removemoney"].includes(commandName)) {
    if (user.id !== OWNER_ID) {
      const embed = new EmbedBuilder()
        .setDescription("❌ **คำสั่งนี้ใช้ได้เฉพาะ Owner เท่านั้น**")
        .setColor(COLORS.ERROR)

      return interaction.reply({ embeds: [embed], ephemeral: true })
    }
  }

  // ===================== /addmoney =====================
  if (commandName === "addmoney") {
    const targetUser = interaction.options.getUser("user")
    const amount = interaction.options.getInteger("amount")

    let wallet = loadJSON("./database/wallet.json", {})
    const oldBalance = wallet[targetUser.id] || 0
    wallet[targetUser.id] = oldBalance + amount
    saveJSON("./database/wallet.json", wallet)

    // ให้ยศลูกค้า
    let roleGiven = false
    if (interaction.guild) {
      roleGiven = await giveCustomerRole(interaction.guild, targetUser.id)
    }

    const embed = new EmbedBuilder()
      .setTitle("✅ เพิ่มเงินสำเร็จ!")
      .setDescription(
        `${createDivider()}\n\n` +
        `> 👤 **ผู้ใช้:** ${targetUser}\n` +
        `> 💵 **เพิ่มเงิน:** \`+${formatMoney(amount)} บาท\`\n` +
        `> 💰 **ยอดเดิม:** \`${formatMoney(oldBalance)} บาท\`\n` +
        `> 💳 **ยอดใหม่:** \`${formatMoney(wallet[targetUser.id])} บาท\`\n` +
        `${roleGiven ? `> 🎖️ **ยศลูกค้า:** ให้ยศเรียบร้อย\n` : ''}` +
        `\n${createDivider()}`
      )
      .setColor(COLORS.SUCCESS)
      .setFooter({ text: `โดย ${user.tag}` })
      .setTimestamp()

    return interaction.reply({ embeds: [embed], ephemeral: true })
  }

  // ===================== /removemoney =====================
  if (commandName === "removemoney") {
    const targetUser = interaction.options.getUser("user")
    const amount = interaction.options.getInteger("amount")

    let wallet = loadJSON("./database/wallet.json", {})
    const oldBalance = wallet[targetUser.id] || 0

    // ไม่ให้ติดลบ
    const newBalance = Math.max(0, oldBalance - amount)
    const actualRemoved = oldBalance - newBalance

    wallet[targetUser.id] = newBalance
    saveJSON("./database/wallet.json", wallet)

    const embed = new EmbedBuilder()
      .setTitle("✅ ลบเงินสำเร็จ!")
      .setDescription(
        `${createDivider()}\n\n` +
        `> 👤 **ผู้ใช้:** ${targetUser}\n` +
        `> 💸 **ลบเงิน:** \`-${formatMoney(actualRemoved)} บาท\`\n` +
        `> 💰 **ยอดเดิม:** \`${formatMoney(oldBalance)} บาท\`\n` +
        `> 💳 **ยอดใหม่:** \`${formatMoney(newBalance)} บาท\`\n\n` +
        `${createDivider()}`
      )
      .setColor(COLORS.WARNING)
      .setFooter({ text: `โดย ${user.tag}` })
      .setTimestamp()

    return interaction.reply({ embeds: [embed], ephemeral: true })
  }

  // ===================== /createproduct =====================
  if (commandName === "createproduct") {
    const name = interaction.options.getString("name")
    const price = interaction.options.getInteger("price")
    const cloak = interaction.options.getString("cloak")
    const rank = interaction.options.getString("rank")
    const detail = interaction.options.getString("detail")
    const account = interaction.options.getString("account")

    let products = loadJSON("./database/products.json", [])
    let stock = loadJSON("./database/stock.json", {})
    let forumThreads = loadJSON("./database/forum_threads.json", {})

    if (products.find(p => p.name.toLowerCase() === name.toLowerCase())) {
      return interaction.reply({
        content: `❌ สินค้าชื่อ "${name}" มีอยู่แล้ว`,
        ephemeral: true
      })
    }

    // ดึง minecraftName จาก account
    const [minecraftName, password] = account.split(':')

    const productId = Date.now()
    products.push({ id: productId, name, price, cloak, rank, detail })
    saveJSON("./database/products.json", products)

    if (!stock[name]) {
      stock[name] = []
    }
    stock[name].push(account)
    saveJSON("./database/stock.json", stock)

    // สร้าง Forum Thread
    let threadId = null
    let forumCreated = false
    if (interaction.guild) {
      threadId = await createForumThread(interaction.guild, name, minecraftName, { price, cloak, rank, detail })
      if (threadId) {
        // เก็บ mapping ระหว่าง account กับ threadId
        if (!forumThreads[name]) {
          forumThreads[name] = {}
        }
        forumThreads[name][account] = threadId
        saveJSON("./database/forum_threads.json", forumThreads)
        forumCreated = true
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("✅ สร้างสินค้าสำเร็จ!")
      .setDescription(
        `${createDivider()}\n\n` +
        `📦 **ชื่อ:** ${name}\n` +
        `💰 **ราคา:** ${formatMoney(price)} บาท\n` +
        `🎭 **ผ้าคลุม:** ${cloak}\n` +
        `⭐ **แรงค์:** ${rank}\n` +
        `📝 **รายละเอียด:** ${detail}\n` +
        `📥 **Stock:** ${stock[name].length} ชิ้น\n` +
        `${forumCreated ? `📌 **Forum Thread:** สร้างแล้ว (IGN : ${minecraftName})\n` : ''}` +
        `\n${createDivider()}`
      )
      .setColor(COLORS.SUCCESS)
      .setTimestamp()

    await interaction.reply({ embeds: [embed], ephemeral: true })

    const announceEmbed = new EmbedBuilder()
      .setTitle("🎉 สินค้าใหม่มาแล้ว!")
      .setDescription(
        `${createDivider()}\n\n` +
        `📦 **${name}**\n\n` +
        `> 💰 **ราคา:** \`${formatMoney(price)} บาท\`\n` +
        `> 🎭 **ผ้าคลุม:** ${cloak}\n` +
        `> ⭐ **แรงค์:** ${rank}\n` +
        `> 📝 **รายละเอียด:** ${detail}\n` +
        `> 📤 **สถานะ:** \`ยังไม่ออก\`\n\n` +
        `${createDivider()}\n\n` +
        `🛒 **พร้อมขายแล้ววันนี้!**`
      )
      .setColor(COLORS.GOLD)
      .setThumbnail(`https://visage.surgeplay.com/full/512/${minecraftName}`)
      .setFooter({ text: "Sonati Seller • สินค้าใหม่ • ยังไม่ออก" })
      .setTimestamp()

    await interaction.channel.send({
      content: "@everyone 🔔 **สินค้าใหม่มาแล้ว!**",
      embeds: [announceEmbed]
    })

    return
  }

  // ===================== /addstock =====================
  if (commandName === "addstock") {
    const productName = interaction.options.getString("product")
    const account = interaction.options.getString("account")

    const products = loadJSON("./database/products.json", [])
    const product = products.find(p => p.name.toLowerCase() === productName.toLowerCase())

    if (!product) {
      return interaction.reply({
        content: `❌ ไม่พบสินค้า "${productName}"`,
        ephemeral: true
      })
    }

    let stock = loadJSON("./database/stock.json", {})
    let forumThreads = loadJSON("./database/forum_threads.json", {})

    if (!stock[product.name]) {
      stock[product.name] = []
    }

    stock[product.name].push(account)
    saveJSON("./database/stock.json", stock)

    // ดึง minecraftName และสร้าง Forum Thread
    const [minecraftName] = account.split(':')
    let forumCreated = false

    if (interaction.guild) {
      const threadId = await createForumThread(interaction.guild, product.name, minecraftName, product)
      if (threadId) {
        if (!forumThreads[product.name]) {
          forumThreads[product.name] = {}
        }
        forumThreads[product.name][account] = threadId
        saveJSON("./database/forum_threads.json", forumThreads)
        forumCreated = true
      }
    }

    const embed = new EmbedBuilder()
      .setDescription(
        `✅ เพิ่ม stock **${product.name}** สำเร็จ!\n` +
        `📦 คงเหลือ: **${stock[product.name].length}** ชิ้น\n` +
        `${forumCreated ? `📌 Forum Thread: สร้างแล้ว (IGN : ${minecraftName})` : ''}`
      )
      .setColor(COLORS.SUCCESS)

    return interaction.reply({ embeds: [embed], ephemeral: true })
  }

  // ===================== /panel =====================
  if (commandName === "panel") {
    await interaction.deferReply({ ephemeral: true })

    let products = loadJSON("./database/products.json", [])
    let stock = loadJSON("./database/stock.json", {})

    if (products.length === 0) {
      return interaction.editReply("❌ ยังไม่มีสินค้า ใช้ `/createproduct` เพื่อเพิ่ม")
    }

    const productName = interaction.options.getString("product")
    const targetChannel = interaction.options.getChannel("channel") || interaction.channel

    if (productName) {
      const found = products.find(p => p.name.toLowerCase() === productName.toLowerCase())
      if (!found) {
        return interaction.editReply(`❌ ไม่พบสินค้า "${productName}"`)
      }
      products = [found]
    }

    for (const product of products) {
      const stockCount = stock[product.name]?.length || 0
      const statusEmoji = stockCount > 0 ? "🟢" : "🔴"
      const statusText = stockCount > 0 ? "พร้อมขาย" : "สินค้าหมด"

      const embed = new EmbedBuilder()
        .setAuthor({
          name: "SONATI SELLER",
          iconURL: "https://cdn.discordapp.com/attachments/1234567890/shop-icon.png"
        })
        .setTitle(`🛒 ${product.name}`)
        .setDescription(
          `${createDivider()}\n\n` +
          `> 💰 **ราคา:** \`${formatMoney(product.price)} บาท\`\n` +
          `> 🎭 **ผ้าคลุม:** ${product.cloak}\n` +
          `> ⭐ **แรงค์:** ${product.rank}\n` +
          `${createDivider()}\n\n` +
          `📝 **รายละเอียด:**\n` +
          `\`\`\`${product.detail}\`\`\`\n` +
          `${createDivider()}`
        )
        .setImage(`https://visage.surgeplay.com/full/512/${product.name}`)
        .setColor(stockCount > 0 ? COLORS.SUCCESS : COLORS.ERROR)
        .setFooter({
          text: `${statusEmoji} ${statusText} • Sonati Seller`,
          iconURL: TMONEY_ICON
        })
        .setTimestamp()

      const buyButton = new ButtonBuilder()
        .setCustomId(`buy_${product.name}`)
        .setLabel(`ซื้อ ${product.name}`)
        .setStyle(ButtonStyle.Success)
        .setEmoji("🛒")
        .setDisabled(stockCount === 0)

      const topupButton = new ButtonBuilder()
        .setCustomId("show_topup_options")
        .setLabel("เติมเงิน")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("💰")

      const row = new ActionRowBuilder()
        .addComponents(buyButton, topupButton)

      await targetChannel.send({ embeds: [embed], components: [row] })
    }

    return interaction.editReply(`✅ ส่ง Panel ไปที่ <#${targetChannel.id}> แล้ว!`)
  }
})

// ===================== BUTTON HANDLER =====================
client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return

  try {
    // ===== ปุ่มซื้อสินค้า =====
    if (interaction.customId.startsWith("buy_")) {
      await interaction.deferReply({ ephemeral: true })

      const productName = interaction.customId.replace("buy_", "")

      let products = loadJSON("./database/products.json", [])
      let stock = loadJSON("./database/stock.json", {})
      let wallet = loadJSON("./database/wallet.json", {})
      let soldHistory = loadJSON("./database/sold_history.json", [])
      let forumThreads = loadJSON("./database/forum_threads.json", {})

      const item = products.find(p => p.name === productName)

      if (!item) {
        const embed = new EmbedBuilder()
          .setDescription("❌ **ไม่พบสินค้านี้ในระบบ**")
          .setColor(COLORS.ERROR)
        return interaction.editReply({ embeds: [embed] })
      }

      const userMoney = wallet[interaction.user.id] || 0

      if (userMoney < item.price) {
        const embed = new EmbedBuilder()
          .setTitle("❌ เงินไม่เพียงพอ")
          .setDescription(
            `${createDivider()}\n\n` +
            `> 💰 **เงินของคุณ:** \`${formatMoney(userMoney)} บาท\`\n` +
            `> 🏷️ **ราคาสินค้า:** \`${formatMoney(item.price)} บาท\`\n` +
            `> 📊 **ขาดอีก:** \`${formatMoney(item.price - userMoney)} บาท\`\n\n` +
            `${createDivider()}\n\n` +
            `💡 *กดปุ่ม "เติมเงิน" เพื่อเติมเงินเข้าระบบ*`
          )
          .setColor(COLORS.ERROR)
          .setTimestamp()

        return interaction.editReply({ embeds: [embed] })
      }

      if (!stock[productName] || stock[productName].length === 0) {
        const embed = new EmbedBuilder()
          .setDescription("❌ **สินค้าหมด กรุณารอ stock เพิ่ม**")
          .setColor(COLORS.ERROR)
        return interaction.editReply({ embeds: [embed] })
      }

      const account = stock[productName].shift()
      wallet[interaction.user.id] = userMoney - item.price

      const [minecraftName, password] = account.split(':')

      soldHistory.push({
        id: Date.now(),
        buyerId: interaction.user.id,
        buyerTag: interaction.user.tag,
        productName: item.name,
        productId: item.id,
        minecraftName: minecraftName,
        price: item.price,
        boughtAt: new Date().toISOString()
      })

      // อัปเดต Forum Thread เป็น SOLD และ Close
      if (interaction.guild && forumThreads[productName] && forumThreads[productName][account]) {
        const threadId = forumThreads[productName][account]
        await markForumThreadAsSold(interaction.guild, threadId, productName, minecraftName)

        // ลบ mapping ออก
        delete forumThreads[productName][account]
        saveJSON("./database/forum_threads.json", forumThreads)
      }

      let productDeleted = false
      if (stock[productName]?.length === 0) {
        const productIndex = products.findIndex(p => p.name === productName)
        if (productIndex !== -1) {
          products.splice(productIndex, 1)
          productDeleted = true
          console.log(`✅ ลบสินค้า ${productName} (ID: ${item.id}) ออกจากระบบเนื่องจาก stock หมด`)
        }
        delete stock[productName]
      }

      saveJSON("./database/products.json", products)
      saveJSON("./database/wallet.json", wallet)
      saveJSON("./database/stock.json", stock)
      saveJSON("./database/sold_history.json", soldHistory)

      // ส่ง DM
      let dmSent = false
      try {
        const dmEmbed = new EmbedBuilder()
          .setAuthor({ name: "SONATI SELLER", iconURL: TMONEY_ICON })
          .setTitle("📦 สินค้าที่คุณซื้อ")
          .setDescription(
            `${createDivider()}\n\n` +
            `🎮 **${item.name}**\n\n` +
            `> 👤 **อีเมล:** \`${minecraftName}\`\n` +
            `${password ? `> 🔑 **โค้ดเปลี่ยน:** \`${password}\`\n` : ''}` +
            `\n${createDivider()}\n\n` +
            `> 💸 **หักเงิน:** \`${formatMoney(item.price)} บาท\`\n` +
            `> 💰 **คงเหลือ:** \`${formatMoney(wallet[interaction.user.id])} บาท\`\n\n` +
            `${createDivider()}\n\n` +
            `✨ **รายละเอียดสินค้า:**\n` +
            `> 🎭 ผ้าคลุม: ${item.cloak}\n` +
            `> ⭐ แรงค์: ${item.rank}\n` +
            `> 📝 ${item.detail}\n\n` +
            `> 🎞 **คลิปสอนเปลี่ยน : https://streamable.com/lxqyqc**\n\n` +
            `${createDivider()}`
          )
          .setColor(COLORS.SUCCESS)
          .setThumbnail(`https://visage.surgeplay.com/face/128/${minecraftName}`)
          .setFooter({ text: "ขอบคุณที่ใช้บริการ • Sonati Seller" })
          .setTimestamp()

        await interaction.user.send({ embeds: [dmEmbed] })
        dmSent = true
      } catch (dmError) {
        console.log(`⚠️ ไม่สามารถส่ง DM ให้ ${interaction.user.tag} ได้:`, dmError)
        dmSent = false
      }

      if (!dmSent) {
        try {
          const guild = interaction.guild
          const privateChannel = await guild.channels.create({
            name: `receipt-${interaction.user.username}`,
            type: 0,
            permissionOverwrites: [
              {
                id: guild.id,
                deny: [PermissionFlagsBits.ViewChannel]
              },
              {
                id: interaction.user.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
              },
              {
                id: OWNER_ID,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
              },
              {
                id: client.user.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
              }
            ]
          })

          const receiptEmbed = new EmbedBuilder()
            .setAuthor({ name: "SONATI SELLER", iconURL: TMONEY_ICON })
            .setTitle("✅ ซื้อสินค้าสำเร็จ")
            .setDescription(
              `สวัสดีคุณ ${interaction.user}!\n\n` +
              `${createDivider()}\n\n` +
              `> 📦 **สินค้า:** ${item.name}\n` +
              `> 👤 **อีเมล:** \`${minecraftName}\`\n` +
              `${password ? `> 🔑 **โค้ดเปลี่ยน:** \`${password}\`\n` : ''}` +
              `> 💰 **ราคา:** \`${formatMoney(item.price)} บาท\`\n` +
              `> 💵 **คงเหลือ:** \`${formatMoney(wallet[interaction.user.id])} บาท\`\n\n` +
              `${createDivider()}\n\n` +
              `**✨ รายละเอียดสินค้า:**\n` +
              `> 🎭 ผ้าคลุม: ${item.cloak}\n` +
              `> ⭐ แรงค์: ${item.rank}\n` +
              `> 📝 ${item.detail}\n\n` +
              `${createDivider()}\n\n` +
              `⏰ *ห้องนี้จะถูกลบอัตโนมัติใน 5 นาที*`
            )
            .setColor(COLORS.SUCCESS)
            .setTimestamp()

          await privateChannel.send({ content: `${interaction.user}`, embeds: [receiptEmbed] })

          setTimeout(async () => {
            try {
              await privateChannel.delete()
              console.log(`✅ ลบห้อง ${privateChannel.name} เรียบร้อย`)
            } catch (error) {
              console.error(`❌ ไม่สามารถลบห้อง ${privateChannel.name}:`, error)
            }
          }, 5 * 60 * 1000)

          const successEmbed = new EmbedBuilder()
            .setDescription(`✅ **ซื้อสำเร็จ!** ไปรับสินค้าได้ที่ <#${privateChannel.id}>`)
            .setColor(COLORS.SUCCESS)

          interaction.editReply({ embeds: [successEmbed] })

        } catch (channelError) {
          console.error("ไม่สามารถสร้างห้องส่วนตัว:", channelError)
          const errorEmbed = new EmbedBuilder()
            .setDescription(
              `✅ **ซื้อสำเร็จ!** แต่ไม่สามารถส่ง DM ให้คุณได้\n` +
              `กรุณาติดต่อ Owner เพื่อรับสินค้า: <@${OWNER_ID}>`
            )
            .setColor(COLORS.WARNING)

          interaction.editReply({ embeds: [errorEmbed] })
        }
      } else {
        const successEmbed = new EmbedBuilder()
          .setDescription("✅ **ซื้อสำเร็จ!** เช็ค DM ของคุณ")
          .setColor(COLORS.SUCCESS)

        interaction.editReply({ embeds: [successEmbed] })
      }

      // แจ้งเตือนไปที่ห้อง UPDATE STOCK
      try {
        if (UPDATE_STOCK_CHANNEL && UPDATE_STOCK_CHANNEL !== "YOUR_UPDATE_STOCK_CHANNEL_ID") {
          const updateStockChannel = interaction.guild.channels.cache.get(UPDATE_STOCK_CHANNEL)
          if (updateStockChannel) {
            const stockUpdateEmbed = new EmbedBuilder()
              .setTitle("🛒 มีการซื้อสินค้า")
              .setDescription(
                `${createDivider()}\n\n` +
                `> 👤 **ผู้ซื้อ:** ${interaction.user.tag}\n` +
                `> 🆔 **ID:** \`${interaction.user.id}\`\n` +
                `> 📦 **สินค้า:** ${item.name}\n` +
                `> 🎮 **อีเมล:** \`${minecraftName}\`\n` +
                `${password ? `> 🔑 **โค้ดเปลี่ยนเมล:** \`${password}\`\n` : ''}` +
                `> 💰 **ราคา:** \`${formatMoney(item.price)} บาท\`\n` +
                `> 📊 **stock คงเหลือ:** \`${stock[productName]?.length || 0} ชิ้น\`\n` +
                `> 📨 **ส่ง DM:** ${dmSent ? '✅' : '❌'}\n` +
                `> 📌 **Forum Thread:** อัปเดตเป็น SOLD แล้ว\n` +
                `> 📤 **สถานะ:** \`ออกแล้ว\`\n\n` +
                `${createDivider()}`
              )
              .setColor(dmSent ? COLORS.SUCCESS : COLORS.WARNING)
              .setFooter({ text: "Sonati Seller • ออกแล้ว" })
              .setTimestamp()

            await updateStockChannel.send({ embeds: [stockUpdateEmbed] })
          } else {
            console.log("⚠️ ไม่พบห้อง UPDATE STOCK")
          }
        }
      } catch (notifyError) {
        console.error("แจ้งเตือนห้อง UPDATE STOCK ไม่สำเร็จ:", notifyError)
      }

      // อัปเดต panel message
      try {
        const messages = await interaction.channel.messages.fetch({ limit: 20 })
        const panelMessage = messages.find(m =>
          m.embeds[0]?.title === `🛒 ${item.name}` &&
          m.components[0]?.components[0]?.customId === `buy_${item.name}`
        )

        if (panelMessage) {
          const newStockCount = stock[productName]?.length || 0
          const statusEmoji = newStockCount > 0 ? "🟢" : "🔴"
          const statusText = newStockCount > 0 ? "พร้อมขาย" : "สินค้าหมด"

          const updatedEmbed = EmbedBuilder.from(panelMessage.embeds[0])
            .setDescription(
              `${createDivider()}\n\n` +
              `> 💰 **ราคา:** \`${formatMoney(item.price)} บาท\`\n` +
              `> 🎭 **ผ้าคลุม:** ${item.cloak}\n` +
              `> ⭐ **แรงค์:** ${item.rank}\n` +
              `${createDivider()}\n\n` +
              `📝 **รายละเอียด:**\n` +
              `\`\`\`${item.detail}\`\`\`\n` +
              `${createDivider()}`
            )
            .setColor(newStockCount > 0 ? COLORS.SUCCESS : COLORS.ERROR)
            .setFooter({
              text: `${statusEmoji} ${statusText} • Sonati Seller`,
              iconURL: TMONEY_ICON
            })

          const updatedBuyButton = ButtonBuilder.from(panelMessage.components[0].components[0])
            .setDisabled(newStockCount === 0)

          const topupButton = ButtonBuilder.from(panelMessage.components[0].components[1])

          await panelMessage.edit({
            embeds: [updatedEmbed],
            components: [new ActionRowBuilder().addComponents(updatedBuyButton, topupButton)]
          })

          console.log(`✅ อัปเดต embed ของ ${item.name} (stock คงเหลือ: ${newStockCount})`)
        }
      } catch (updateError) {
        console.error("Update panel error:", updateError)
      }
    }

    // ===== ปุ่มแสดงตัวเลือกเติมเงิน =====
    if (interaction.customId === "show_topup_options") {
      const embed = new EmbedBuilder()
        .setAuthor({ name: "SONATI SELLER", iconURL: TMONEY_ICON })
        .setTitle("💰 เลือกวิธีเติมเงิน")
        .setDescription(
          `${createDivider()}\n\n` +
          `🧧 **ซองอังเปาวอลเล็ท**\n` +
          `> ชำระเงินผ่านลิงก์ซองอังเปา TrueMoney\n` +
          `> รับเงินทันที อัตโนมัติ 100%\n\n` +
          `🏦 **พร้อมเพย์ & ธนาคาร**\n` +
          `> ชำระเงินแบบสแกน QR Code\n` +
          `> แนบสลิปเพื่อยืนยัน\n\n` +
          `${createDivider()}`
        )
        .setImage(QR_IMAGE)
        .setColor(COLORS.PRIMARY)
        .setFooter({ text: "Sonati Seller • ระบบตรวจสลิปอัตโนมัติ" })

      const walletButton = new ButtonBuilder()
        .setCustomId("topup_wallet")
        .setLabel("ซองอังเปาวอลเล็ท")
        .setStyle(ButtonStyle.Success)
        .setEmoji("🧧")

      const bankButton = new ButtonBuilder()
        .setCustomId("topup_bank")
        .setLabel("พร้อมเพย์ & ธนาคาร")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🏦")

      const row = new ActionRowBuilder().addComponents(walletButton, bankButton)

      await interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: true
      })
    }

    // ===== ปุ่มเติมเงินแบบซองอังเปา =====
    if (interaction.customId === "topup_wallet") {
      const modal = new ModalBuilder()
        .setCustomId("topup_wallet_modal")
        .setTitle("🧧 เติมเงินด้วยซองอังเปา")

      const linkInput = new TextInputBuilder()
        .setCustomId("gift_link")
        .setLabel("ลิงก์ซองอังเปา TrueMoney")
        .setPlaceholder("https://gift.truemoney.com/campaign/?v=xxxxx")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(30)

      const row = new ActionRowBuilder().addComponents(linkInput)
      modal.addComponents(row)

      await interaction.showModal(modal)
    }

    // ===== ปุ่มเติมเงินแบบธนาคาร =====
    if (interaction.customId === "topup_bank") {
      const embed = new EmbedBuilder()
        .setTitle("🏦 เติมเงินผ่านธนาคาร")
        .setDescription(
          `${createDivider()}\n\n` +
          `📍 **ไปที่ห้อง:** <#${TOPUP_CHANNEL}>\n\n` +
          `**ขั้นตอน:**\n` +
          `> 1️⃣ โอนเงินตาม QR Code ในห้อง\n` +
          `> 2️⃣ แนบรูปสลิปในห้องเติมเงิน\n` +
          `> 3️⃣ รอระบบตรวจสอบอัตโนมัติ\n\n` +
          `${createDivider()}`
        )
        .setColor(COLORS.PRIMARY)
        .setFooter({ text: "Sonati Seller • ระบบตรวจสลิปอัตโนมัติ" })

      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      })
    }

  } catch (err) {
    console.error("Button Error:", err)

    const errorEmbed = new EmbedBuilder()
      .setDescription("❌ **เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง**")
      .setColor(COLORS.ERROR)

    if (interaction.deferred) {
      interaction.editReply({ embeds: [errorEmbed] })
    } else if (!interaction.replied) {
      interaction.reply({ embeds: [errorEmbed], ephemeral: true })
    }
  }
})

// ===================== MODAL HANDLER =====================
client.on("interactionCreate", async interaction => {
  if (!interaction.isModalSubmit()) return
  if (interaction.customId !== "topup_wallet_modal") return

  await interaction.deferReply({ ephemeral: true })

  const giftLink = interaction.fields.getTextInputValue("gift_link")

  if (!giftLink.includes("gift.truemoney.com")) {
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ ลิงก์ไม่ถูกต้อง")
      .setDescription("กรุณาใส่ลิงก์ซองอังเปา TrueMoney ที่ถูกต้อง")
      .setColor(COLORS.ERROR)

    return interaction.editReply({ embeds: [errorEmbed] })
  }

  try {
    const loadingEmbed = new EmbedBuilder()
      .setTitle("🧧 กำลังรับซองอังเปา")
      .setDescription(
        `${createDivider()}\n\n` +
        `⏳ **กรุณารอสักครู่...**\n` +
        `กำลังตรวจสอบและรับซองอังเปา\n\n` +
        `${createDivider()}`
      )
      .setColor(COLORS.WARNING)

    await interaction.editReply({ embeds: [loadingEmbed] })

    // Extract voucher hash from link
    const voucherMatch = giftLink.match(/v=([a-zA-Z0-9]+)/)
    if (!voucherMatch) {
      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ ลิงก์ไม่ถูกต้อง")
        .setDescription("ไม่พบรหัสซองอังเปาในลิงก์")
        .setColor(COLORS.ERROR)
      return interaction.editReply({ embeds: [errorEmbed] })
    }

    const voucherHash = voucherMatch[1]

    const response = await axios.post(
      `https://gift.truemoney.com/campaign/vouchers/${voucherHash}/redeem`,
      {
        mobile: YOUR_PHONE_NUMBER,
        voucher_hash: voucherHash
      },
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        },
        timeout: 15000
      }
    )

    const data = response.data

    if (data && data.status && data.status.code === "SUCCESS" && data.data && data.data.voucher) {
      const amount = parseFloat(data.data.voucher.amount_baht)

      let wallet = loadJSON("./database/wallet.json", {})
      wallet[interaction.user.id] = (wallet[interaction.user.id] || 0) + amount

      saveJSON("./database/wallet.json", wallet)

      // ให้ยศลูกค้าเมื่อเติมเงินสำเร็จ
      let roleGiven = false
      if (interaction.guild) {
        roleGiven = await giveCustomerRole(interaction.guild, interaction.user.id)
      }

      const successEmbed = new EmbedBuilder()
        .setTitle("✅ เติมเงินสำเร็จ!")
        .setDescription(
          `${createDivider()}\n\n` +
          `> 🧧 **รับซอง:** \`+${formatMoney(amount)} บาท\`\n` +
          `> 💰 **ยอดเงินคงเหลือ:** \`${formatMoney(wallet[interaction.user.id])} บาท\`\n` +
          `${roleGiven ? `> 🎖️ **ยศลูกค้า:** ได้รับยศเรียบร้อย!\n` : ''}` +
          `\n${createDivider()}\n\n` +
          `✨ *ขอบคุณที่ใช้บริการ Sonati Seller*`
        )
        .setColor(COLORS.SUCCESS)
        .setTimestamp()

      await interaction.editReply({ embeds: [successEmbed] })

    } else {
      // ตรวจสอบ error message จาก API
      const errorMsg = data?.status?.message || "ไม่ทราบสาเหตุ"

      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ รับซองไม่สำเร็จ")
        .setDescription(
          `${createDivider()}\n\n` +
          `**สาเหตุ:** ${errorMsg}\n\n` +
          `**สาเหตุที่เป็นไปได้:**\n` +
          `> • ซองถูกใช้ไปแล้ว\n` +
          `> • ซองหมดอายุ\n` +
          `> • ลิงก์ไม่ถูกต้อง\n` +
          `> • เบอร์โทรศัพท์ไม่ถูกต้อง\n\n` +
          `${createDivider()}`
        )
        .setColor(COLORS.ERROR)

      await interaction.editReply({ embeds: [errorEmbed] })
    }

  } catch (error) {
    console.error("Angpao API Error:", error?.response?.data || error)

    const errorData = error?.response?.data
    let errorMessage = "ไม่สามารถเชื่อมต่อระบบได้"

    if (errorData?.status?.message) {
      errorMessage = errorData.status.message
    } else if (error?.response?.status === 400) {
      errorMessage = "ซองอังเปานี้ถูกใช้ไปแล้วหรือหมดอายุ"
    } else if (error?.response?.status === 404) {
      errorMessage = "ไม่พบซองอังเปานี้"
    }

    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ รับซองไม่สำเร็จ")
      .setDescription(
        `${createDivider()}\n\n` +
        `**${errorMessage}**\n\n` +
        `กรุณาตรวจสอบลิงก์และลองใหม่อีกครั้ง\n\n` +
        `${createDivider()}`
      )
      .setColor(COLORS.ERROR)

    await interaction.editReply({ embeds: [errorEmbed] })
  }
})

// ===================== SLIP CHECK =====================
client.on("messageCreate", async message => {
  if (message.author.bot) return
  if (message.channel.id !== TOPUP_CHANNEL) return
  if (!message.attachments.first()) return

  const slipURL = message.attachments.first().url

  try {
    const res = await axios.post(
      SLIPOK_URL,
      { url: slipURL },
      {
        headers: {
          "x-authorization": SLIPOK_KEY,
          "Content-Type": "application/json"
        }
      }
    )

    if (!res.data.success) {
      const errorEmbed = new EmbedBuilder()
        .setDescription("❌ **สลิปไม่ถูกต้อง**")
        .setColor(COLORS.ERROR)

      return message.reply({ embeds: [errorEmbed] })
    }

    const data = res.data.data
    const amount = parseFloat(data.amount)
    const slipID = data.transRef

    let wallet = loadJSON("./database/wallet.json", {})
    let used = loadJSON("./database/usedslips.json", [])

    if (used.includes(slipID)) {
      const errorEmbed = new EmbedBuilder()
        .setDescription("❌ **สลิปนี้ถูกใช้แล้ว**")
        .setColor(COLORS.ERROR)

      return message.reply({ embeds: [errorEmbed] })
    }

    used.push(slipID)
    wallet[message.author.id] = (wallet[message.author.id] || 0) + amount

    saveJSON("./database/wallet.json", wallet)
    saveJSON("./database/usedslips.json", used)

    // ให้ยศลูกค้าเมื่อเติมเงินผ่านสลิปสำเร็จ
    let roleGiven = false
    if (message.guild) {
      roleGiven = await giveCustomerRole(message.guild, message.author.id)
    }

    const successEmbed = new EmbedBuilder()
      .setTitle("✅ เติมเงินสำเร็จ!")
      .setDescription(
        `${createDivider()}\n\n` +
        `> 💵 **เติมเงิน:** \`+${formatMoney(amount)} บาท\`\n` +
        `> 💰 **คงเหลือ:** \`${formatMoney(wallet[message.author.id])} บาท\`\n` +
        `${roleGiven ? `> 🎖️ **ยศลูกค้า:** ได้รับยศเรียบร้อย!\n` : ''}` +
        `\n${createDivider()}`
      )
      .setColor(COLORS.SUCCESS)
      .setTimestamp()

    message.reply({ embeds: [successEmbed] })

  } catch (err) {
    console.error("Slip Error:", err)

    const errorEmbed = new EmbedBuilder()
      .setDescription("❌ **ตรวจสลิปไม่สำเร็จ กรุณาลองใหม่**")
      .setColor(COLORS.ERROR)

    message.reply({ embeds: [errorEmbed] })
  }
})

// ===================== LOGIN =====================
client.login(TOKEN)
