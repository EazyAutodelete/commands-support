import {
  Bot,
  CommandButtonArgs,
  CommandMessage,
  CommandMessageArgs,
  Command,
  CommandButton,
  Module,
  CommandMenu,
  CommandMenuArgs,
  CommandModal,
  CommandModalArgs,
} from "@eazyautodelete/core";
import { msToDuration, snowflakeToDate } from "@eazyautodelete/bot-utils";
import {
  AutocompleteInteraction,
  CommandInteraction,
  ComponentInteraction,
  GuildChannel,
  Message,
  ModalSubmitInteraction,
} from "eris";

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

  async interactionCreate(
    interaction: CommandInteraction | AutocompleteInteraction | ComponentInteraction | ModalSubmitInteraction
  ) {
    if (interaction.type === 2) {
      const startAt = performance.now();

      if (!interaction.channel || interaction.channel.type === 1 || !interaction.guildID) {
        const userData = interaction.user?.id ? await this.db.getUserSettings(interaction.user.id) : { language: "en" };
        return await interaction
          .createMessage({
            embeds: [
              {
                color: this.bot.utils.getColor("error"),
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

      const message = new CommandMessage(this.bot, interaction);
      const args = new CommandMessageArgs(message);

      const commandName = args.getCommand();
      const command = <Command>this.bot.commands.get(commandName);
      if (!command) return this.logger.warn(`Command ${commandName} not found!`, "CMD");

      const guild = this.bot.client.guilds.get(interaction.guildID);
      if (!guild) return;

      const member = interaction.member || (interaction.user?.id ? guild.members.get(interaction.user.id) : null);

      if (!member) return;

      interaction.member = member;

      await message.loadData();

      const cooldown = this.bot.cooldowns.hasCooldown(commandName, member.user.id);
      if (cooldown) {
        const cooldownEmbed = {
          color: this.bot.utils.getColor("error"),
          description: message.translate(
            "onCooldown",
            msToDuration(cooldown).length > 5 ? msToDuration(cooldown) : "1 second"
          ),
          footer: {
            text: "EazyAutodelete",
            iconURL: this.client.user.avatarURL,
          },
          timestamp: new Date(),
        };

        return await interaction.createMessage({
          embeds: [cooldownEmbed],
          flags: 64,
        });
      }

      if (this.bot.config.commands.disabled.find((x: { name: string; reason: string }) => x.name === commandName)) {
        const disabledReason = this.bot.config.commands.disabled.find(
          (x: { name: string; reason: string }) => x.name === commandName
        ).reason;
        if (disabledReason && !this.bot.permissions.isBotMod(member.user.id)) {
          const commandDisabledEmbed = {
            timestamp: new Date(),
            color: this.bot.utils.getColor("error"),
            description: message.translate("commandDisabled", commandName, disabledReason),
            footer: {
              text: this.client.user.username,
              iconURL: this.client.user.avatarURL,
            },
          };

          return await interaction.createMessage({
            embeds: [commandDisabledEmbed],
            flags: 64,
          });
        }
      }

      const missingBotPerms: bigint[] = [];
      const channelId = interaction.channel.id;
      const channel = <GuildChannel>(interaction.channel || this.bot.client.getChannel(channelId));
      if (!channel) return;

      const clientMember = guild.members.get(this.client.user.id);
      if (!clientMember) return;

      const botPerms = channel.permissionsOf(this.client.user.id);
      const defaultPerms = [BigInt(2048), BigInt(16384), BigInt(262144)];

      defaultPerms.map(s => {
        botPerms.has(s) || missingBotPerms.push(s);
      });
      command.botPermissions.map(s => {
        botPerms.has(s) || missingBotPerms.push(s);
      });
      if (missingBotPerms.length >= 1) {
        const botMissingPermsEmbed = {
          timestamp: new Date(),
          color: this.bot.utils.getColor("error"),
          description: message.translate("missingBotPerms", channel.id, missingBotPerms.join(", ")),
          footer: {
            text: this.client.user.username,
            iconURL: this.client.user.avatarURL,
          },
        };

        return await interaction.createMessage({
          embeds: [botMissingPermsEmbed],
          flags: 64,
        });
      }

      if (!this.bot.permissions.hasPermsToUseCommand(command, member, message.data.guild)) {
        const noPermsEmbed = {
          timestamp: new Date(),
          color: this.bot.utils.getColor("error"),
          description: message.translate("missingPerms"),
          footer: {
            text: "EazyAutodelete",
            iconURL: this.client.user.avatarURL,
          },
        };

        return await interaction.createMessage({
          embeds: [noPermsEmbed],
          flags: 64,
        });
      }

      try {
        await command.run(message, args);
      } catch (error) {
        this.logger.error(error as string);
      }

      this.bot.permissions.isBotMod(member.user.id) || this.bot.cooldowns.setCooldown(commandName, member.user.id);

      this.logger.info("Ran command '" + commandName + "' in " + (performance.now() - startAt) + "ms", "CMD");
    } else if (interaction.type === 4) {
      const commandName = interaction.data.name;
      const command = <Command>this.bot.commands.get(commandName);
      if (!command) return this.logger.warn(`Command:Autocomplete ${commandName} not found!`, "CMD");

      const opt = interaction.data.options;
      if (opt[0].type === 3) {
        const autocompleteQuery = opt[0].value;
        if (typeof autocompleteQuery != "string") return;
        const queryResults = await command.autocompleteHandler(autocompleteQuery);

        return await interaction.result(queryResults);
      }
    } else if (interaction.type === 3 && interaction.data.component_type === 3) {
      const created = snowflakeToDate(interaction.message.id);
      const dur = (new Date().getTime() - created.getTime()) / 1000;

      if (dur >= 300) {
        await interaction.createMessage({
          flags: 64,
          embeds: [
            {
              color: this.bot.utils.getColor("error"),
              description: this.bot.translate(
                "expiredSelect",
                interaction.user ? (await this.bot.db.getUserSettings(interaction.user.id)).language : "en"
              ),
            },
          ],
        });
        if (isMessageDeletable(interaction.message)) await interaction.message.delete().catch(this.logger.error);
        return;
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
    } else if (interaction.type === 3 && interaction.data.component_type === 2) {
      const created = snowflakeToDate(interaction.message.id);
      const dur = (new Date().getTime() - created.getTime()) / 1000;

      if (dur >= 300) {
        await interaction.createMessage({
          flags: 64,
          embeds: [
            {
              color: this.bot.utils.getColor("error"),
              description: this.bot.translate(
                "expiredButton",
                interaction.user ? (await this.bot.db.getUserSettings(interaction.user.id)).language : "en"
              ),
            },
          ],
        });
        if (isMessageDeletable(interaction.message)) await interaction.message.delete().catch(this.logger.error);
        return;
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
    } else if (interaction.type === 5) {
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

function isMessageDeletable(message: Message) {
  if (!message.guildID) return message.author.id === message.channel.client.user.id;
  const channel = message.channel;
  if (channel instanceof GuildChannel) {
    const permissions = channel.permissionsOf(channel.client.user.id);
    if (!permissions) return false;
    if (permissions.has("administrator")) return true;
    const timeoutUntil = channel.guild.members.get(channel.client.user.id)?.communicationDisabledUntil;
    return (
      (timeoutUntil && timeoutUntil < Date.now()) ||
      message.author.id === channel.client.user.id ||
      permissions.has("manageMessages")
    );
  }
}
