import {
  Bot,
  CommandButtonArgs,
  CommandMessage,
  CommandArgs,
  Command,
  CommandButton,
  Module,
  CommandMenu,
  CommandMenuArgs,
  CommandModal,
  CommandModalArgs,
} from "@eazyautodelete/core";
import { ColorResolvable, GuildMember, Interaction, Message, Permissions, SnowflakeUtil } from "discord.js";
import { msToDuration } from "@eazyautodelete/bot-utils";
import { stringify } from "querystring";

const now = performance.now;

class CommandSupport extends Module {
  disabledCommands: Map<string, string>;
  constructor(bot: Bot) {
    super(bot);
    this.name = "commands-support";

    this.disabledCommands = new Map();
  }

  clientReady() {
    this.logger.info("[💬] CommandSupport available!");
  }

  async interactionCreate(interaction: Interaction) {
    if (interaction.isCommand() || interaction.isMessageContextMenu()) {
      const startAt = now();

      if (!interaction.channel || interaction.channel.type === "DM" || !interaction.guild) {
        const userData = await this.bot.db.getUserSettings(interaction.user.id);
        return await interaction
          .reply({
            embeds: [
              {
                color: "#ff0000",
                title: ":x: Not supported!",
                description: this.bot.translate("noDMs", userData.language),
              },
            ],
            components: [
              {
                type: 1,
                components: [
                  { type: 2, style: 5, label: "Add EazyAutodelete", url: "https://eazyautodelete.xyz/invite/" },
                ],
              },
            ],
          })
          .catch(this.logger.error);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const message = new CommandMessage(this.bot, interaction as any);
      const args = new CommandArgs(message);

      const commandName = args.getCommand();
      const command = <Command>this.bot.commands.get(commandName);
      if (!command) return this.logger.warn(`Command ${commandName} not found!`, "CMD");

      const guild =
        this.client.guilds.cache.get(interaction.guild.id) || (await this.client.guilds.fetch(interaction.guild.id));

      const member =
        <GuildMember>interaction.member ||
        <GuildMember>guild.members.cache.get(interaction.user.id) ||
        <GuildMember>await guild.members.fetch(interaction.user.id).catch(this.logger.error);

      if (!member)
        return this.logger.error("Failed to load Member " + interaction.user.id + " in Guild " + interaction.guild.id);
      interaction.member = member;

      await message.loadData();

      const cooldown = this.bot.cooldowns.hasCooldown(commandName, member.user.id);
      if (cooldown) {
        const cooldownEmbed = {
          color: this.bot.utils.getColor("error") as ColorResolvable,
          description: message.translate(
            "onCooldown",
            msToDuration(cooldown).length > 5 ? msToDuration(cooldown) : "1 second"
          ),
          footer: {
            text: "EazyAutodelete",

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            iconURL: this.client.user!.avatarURL({
              dynamic: true,
            })!,
          },
          timestamp: new Date(),
        };

        return await interaction.reply({
          embeds: [cooldownEmbed],
          ephemeral: true,
        });
      }

      // TODO disabledCommands
      if (this.bot.config.commands.disabled.find((x: { name: string; reason: string }) => x.name === commandName)) {
        const disabledReason = this.bot.config.commands.disabled.find(
          (x: { name: string; reason: string }) => x.name === commandName
        ).reason;
        if (!disabledReason) return;

        const commandDisabledEmbed = {
          timestamp: Date.now(),
          color: this.bot.utils.getColor("error") as ColorResolvable,
          description: message.translate("commandDisabled", commandName, disabledReason),
          footer: {
            text: "Questions? => /help",

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            iconURL: this.client.user!.avatarURL({
              dynamic: true,
            })!,
          },
        };

        return await interaction.reply({
          embeds: [commandDisabledEmbed],
          ephemeral: true,
        });
      }

      const missingBotPerms: bigint[] = [];
      const channel =
        interaction.channel || (await guild.channels.fetch(interaction.channelId).catch(this.logger.error));
      if (!channel) return;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const clientMember = await guild.members.fetch(this.client.user!.id).catch(this.logger.error);
      if (!clientMember) return;

      const botPerms = channel.permissionsFor(clientMember);
      const defaultPerms = [
        Permissions.FLAGS.SEND_MESSAGES,
        Permissions.FLAGS.EMBED_LINKS,
        Permissions.FLAGS.USE_EXTERNAL_EMOJIS,
      ];
      defaultPerms.map(s => {
        botPerms.has(s) || missingBotPerms.push(s);
      });
      command.botPermissions.map(s => {
        botPerms.has(s) || missingBotPerms.push(s);
      });
      if (missingBotPerms.length >= 1) {
        const botMissingPermsEmbed = {
          timestamp: Date.now(),
          color: this.bot.utils.getColor("error") as ColorResolvable,
          description: message.translate("missingBotPerms", channel.id, missingBotPerms.join(", ")),
          footer: {
            text: "Questions? => /support",
            iconURL:
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              this.client.user!.avatarURL({
                dynamic: true,
              }) || "",
          },
        };

        return await interaction.reply({
          embeds: [botMissingPermsEmbed],
          ephemeral: true,
        });
      }

      if (!this.bot.permissions.hasPermsToUseCommand(command, member, message.data.guild)) {
        const noPermsEmbed = {
          timestamp: Date.now(),
          color: this.bot.utils.getColor("error") as ColorResolvable,
          description: message.translate("missingPerms"),
          footer: {
            text: "EazyAutodelete",
            iconURL:
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              this.client.user!.avatarURL({
                dynamic: true,
              }) || "",
          },
        };

        return await interaction.reply({
          embeds: [noPermsEmbed],
          ephemeral: true,
        });
      }

      try {
        await command.run(message, args);
      } catch (error) {
        this.logger.error(error as string);
      }

      this.bot.permissions.isBotMod(member.user.id) || this.bot.cooldowns.setCooldown(commandName, member.user.id);

      this.logger.info("Ran command '" + commandName + "' in " + (now() - startAt) + "ms", "CMD");
    } else if (interaction.isAutocomplete()) {
      const commandName = interaction.commandName;
      const command = <Command>this.bot.commands.get(commandName);
      if (!command) return this.logger.warn(`Command:Autocomplete ${commandName} not found!`, "CMD");

      const autocompleteQuery = interaction.options.data[0].value;
      if (typeof autocompleteQuery != "string") return;
      const queryResults = await command.autocompleteHandler(autocompleteQuery);

      return await interaction.respond(queryResults);
    } else if (interaction.isSelectMenu()) {
      const created = SnowflakeUtil.deconstruct(interaction.message.id).timestamp;
      const dur = (new Date().getTime() - created) / 1000;

      if (dur >= 300) {
        await interaction.reply({
          ephemeral: true,
          embeds: [
            {
              color: this.bot.utils.getColor("error") as ColorResolvable,
              description: this.bot.translate("expiredSelect", interaction.locale || "en"),
            },
          ],
        });
        if (
          interaction.message instanceof Message &&
          interaction.message.deletable &&
          interaction.message.flags.bitfield === 0
        )
          return void (await interaction.message.delete().catch(this.logger.error));
      }

      const menu = new CommandMenu(this.bot, interaction);
      const args = new CommandMenuArgs(menu);
      if (args.isCommand()) {
        const commandName = args.getCommand();
        const command = <Command>this.bot.commands.get(commandName);
        if (!command) return this.logger.warn(`Command:SelectMenu ${commandName} not found!`, "CMD");

        await menu.loadData();

        return command.selectMenuHandler(menu, args);
      }
    } else if (interaction.isButton()) {
      const created = SnowflakeUtil.deconstruct(interaction.message.id).timestamp;
      const dur = (new Date().getTime() - created) / 1000;

      if (dur >= 300) {
        await interaction.reply({
          ephemeral: true,
          embeds: [
            {
              color: this.bot.utils.getColor("error") as ColorResolvable,
              description: this.bot.translate("expiredButton", interaction.locale || "en"),
            },
          ],
        });
        if (
          interaction.message instanceof Message &&
          interaction.message.deletable &&
          interaction.message.flags.bitfield === 0
        )
          return void (await interaction.message.delete().catch(this.logger.error));
      }

      const button = new CommandButton(this.bot, interaction);
      const args = new CommandButtonArgs(button);

      if (args.isCommand()) {
        const commandName = args.getCommand();
        const command = <Command>this.bot.commands.get(commandName);
        if (!command) return this.logger.warn(`Command:Button ${commandName} not found!`, "CMD");

        await button.loadData();

        return await command.buttonHandler(button, args);
      }
    } else if (interaction.isModalSubmit()) {
      const modal = new CommandModal(this.bot, interaction);
      const args = new CommandModalArgs(modal);

      if (args.isCommand()) {
        const commandName = args.getCommand();
        const command = <Command>this.bot.commands.get(commandName);
        if (!command) return this.logger.warn(`Command:Modal ${commandName} not found!`, "CMD");

        await modal.loadData();

        return await command.modalHandler(modal, args);
      }
    }
  }
}

export default CommandSupport;
