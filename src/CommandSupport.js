"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@eazyautodelete/core");
const discord_js_1 = require("discord.js");
const now = performance.now;
class CommandSupport extends core_1.Module {
    constructor(bot) {
        super(bot);
        this.name = "commands-support";
    }
    clientReady() {
        this.logger.info("[💬] CommandSupport available!");
    }
    interactionCreate(interaction) {
        return __awaiter(this, void 0, void 0, function* () {
            if (interaction.isCommand() || interaction.isMessageContextMenu()) {
                const startAt = now();
                if (!interaction.channel || interaction.channel.type === "DM" || !interaction.guild) {
                    const noDMsButton = new discord_js_1.MessageActionRow().addComponents(new discord_js_1.MessageButton()
                        .setURL("https://eazyautodelete.xyz/invite/")
                        .setStyle("LINK")
                        .setLabel("Add EazyAutodelete"));
                    const noDMsEmbed = new discord_js_1.MessageEmbed()
                        .setColor("#ff0000")
                        .setTitle(":x: Not supported!")
                        .setDescription("Commands via dm are not supported, you need to add EazyAutodelete to a server!");
                    return yield interaction
                        .reply({
                        embeds: [noDMsEmbed],
                        components: [noDMsButton],
                    })
                        .catch(this.logger.error);
                }
                const message = new core_1.CommandMessage(this.bot, interaction);
                const args = new core_1.CommandArgs(message);
                const commandName = args.getCommand();
                const command = this.bot.commands.get(commandName);
                if (!command)
                    return this.logger.warn(`Command ${commandName} not found!`, "CMD");
                const guild = this.client.guilds.cache.get(interaction.guild.id) || (yield this.client.guilds.fetch(interaction.guild.id));
                const member = interaction.member ||
                    guild.members.cache.get(interaction.user.id) ||
                    (yield guild.members.fetch(interaction.user.id).catch(this.logger.error));
                if (!member)
                    return this.logger.error("Failed to load Member " + interaction.user.id + " in Guild " + interaction.guild.id);
                interaction.member = member;
                const cooldown = this.bot.cooldowns.hasCooldown(commandName, member.user.id);
                if (cooldown) {
                    const cooldownEmbed = new discord_js_1.MessageEmbed()
                        .setTimestamp()
                        .setColor(this.bot.utils.getColor("error"))
                        .setDescription(message.translate("onCooldown", cooldown.toString()))
                        .setFooter({
                        text: "EazyAutodelete",
                        iconURL: this.client.user.avatarURL({
                            dynamic: true,
                        }) || "",
                    });
                    return yield interaction.reply({
                        embeds: [cooldownEmbed],
                        ephemeral: true,
                    });
                }
                yield message.loadData();
                // TODO disabledCommands
                /**
                if (client.disabledCommands.has(commandName)) {
                  const disabledReason = client.disabledCommands.get(commandName);
                  if (!disabledReason) return;
          
                  const commandDisabledEmbed = new MessageEmbed()
                    .setTimestamp()
                    .setColor(client.colors.succesfull)
                    .setDescription(message.translate("config.commands.disabled", disabledReason))
                    .setFooter({
                      text: "Questions? => /help",
                      iconURL:
                        client.user?.avatarURL({
                          dynamic: true,
                        }) || undefined,
                    });
          
                  return await interaction.reply({
                    embeds: [commandDisabledEmbed],
                    ephemeral: true,
                  });
                }*/
                const missingBotPerms = [];
                const channel = interaction.channel || (yield guild.channels.fetch(interaction.channelId).catch(this.logger.error));
                if (!channel)
                    return;
                const clientMember = yield guild.members.fetch(this.client.user.id).catch(this.logger.error);
                if (!clientMember)
                    return;
                const botPerms = channel.permissionsFor(clientMember);
                const defaultPerms = [
                    discord_js_1.Permissions.FLAGS.SEND_MESSAGES,
                    discord_js_1.Permissions.FLAGS.EMBED_LINKS,
                    discord_js_1.Permissions.FLAGS.USE_EXTERNAL_EMOJIS,
                ];
                defaultPerms.map(s => {
                    botPerms.has(s) || missingBotPerms.push(s);
                });
                command.botPermissions.map(s => {
                    botPerms.has(s) || missingBotPerms.push(s);
                });
                if (missingBotPerms.length >= 1) {
                    const botMissingPermsEmbed = new discord_js_1.MessageEmbed()
                        .setTimestamp()
                        .setColor(this.bot.utils.getColor("default"))
                        .setDescription(message.translate("missingBotPerms", channel.id, missingBotPerms.join(", ")))
                        .setFooter({
                        text: "Questions? => /help",
                        iconURL: this.client.user.avatarURL({
                            dynamic: true,
                        }) || "",
                    });
                    return yield interaction.reply({
                        embeds: [botMissingPermsEmbed],
                        ephemeral: true,
                    });
                }
                if (!this.bot.permissions.hasPermsToUseCommand(command, member, message.data.guild)) {
                    const noPermsEmbed = new discord_js_1.MessageEmbed()
                        .setTimestamp()
                        .setColor(this.bot.utils.getColor("error"))
                        .setDescription(message.translate("missingPerms"))
                        .setFooter({
                        text: "EazyAutodelete",
                        iconURL: this.client.user.avatarURL({
                            dynamic: true,
                        }) || "",
                    });
                    return yield interaction.reply({
                        embeds: [noPermsEmbed],
                        ephemeral: true,
                    });
                }
                yield command.run(message, args);
                this.bot.permissions.isBotMod(member.user.id) || this.bot.cooldowns.setCooldown(commandName, member.user.id);
                this.logger.info("Ran command '" + commandName + "' in " + (now() - startAt) + "ms", "CMD");
            }
            else if (interaction.isAutocomplete()) {
                const commandName = interaction.commandName;
                const command = this.bot.commands.get(commandName);
                if (!command)
                    return this.logger.warn(`Command:Autocomplete ${commandName} not found!`, "CMD");
                const autocompleteQuery = interaction.options.data[0].value;
                if (typeof autocompleteQuery != "string")
                    return;
                const queryResults = yield command.autocompleteHandler(autocompleteQuery);
                return yield interaction.respond(queryResults);
            }
            else if (interaction.isSelectMenu()) {
                const created = discord_js_1.SnowflakeUtil.deconstruct(interaction.message.id).timestamp;
                const dur = (new Date().getTime() - created) / 1000;
                if (dur >= 300) {
                    yield interaction.reply({
                        ephemeral: true,
                        content: "⏰ You can not use buttons older than 5 minutes.",
                    });
                    if (interaction.message instanceof discord_js_1.Message && interaction.message.deletable)
                        yield interaction.message.delete().catch(this.logger.error);
                    return;
                }
                const menu = new core_1.CommandMenu(this.bot, interaction);
                const args = new core_1.CommandMenuArgs(menu);
                if (args.isCommand()) {
                    const commandName = args.getCommand();
                    const command = this.bot.commands.get(commandName);
                    if (!command)
                        return this.logger.warn(`Command:SelectMenu ${commandName} not found!`, "CMD");
                    yield menu.loadData();
                    return command.selectMenuHandler(menu, args);
                }
            }
            else if (interaction.isButton()) {
                const created = discord_js_1.SnowflakeUtil.deconstruct(interaction.message.id).timestamp;
                const dur = (new Date().getTime() - created) / 1000;
                if (dur >= 300) {
                    yield interaction.reply({
                        ephemeral: true,
                        content: "⏰ You can not use buttons older than 5 minutes.",
                    });
                    if (interaction.message instanceof discord_js_1.Message &&
                        interaction.message.deletable &&
                        interaction.message.flags.bitfield === 0)
                        yield interaction.message.delete().catch(this.logger.error);
                    return;
                }
                const button = new core_1.CommandButton(this.bot, interaction);
                const args = new core_1.CommandButtonArgs(button);
                if (args.isCommand()) {
                    const commandName = args.getCommand();
                    const command = this.bot.commands.get(commandName);
                    if (!command)
                        return this.logger.warn(`Command:Button ${commandName} not found!`, "CMD");
                    yield button.loadData();
                    return yield command.buttonHandler(button, args);
                }
            }
            else if (interaction.isModalSubmit()) {
                const modal = new core_1.CommandModal(this.bot, interaction);
                const args = new core_1.CommandModalArgs(modal);
                if (args.isCommand()) {
                    const commandName = args.getCommand();
                    const command = this.bot.commands.get(commandName);
                    if (!command)
                        return this.logger.warn(`Command:Modal ${commandName} not found!`, "CMD");
                    yield modal.loadData();
                    return yield command.modalHandler(modal, args);
                }
            }
        });
    }
}
exports.default = CommandSupport;
