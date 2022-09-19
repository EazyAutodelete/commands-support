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
import {
  ColorResolvable,
  GuildMember,
  Interaction,
  Message,
  MessageActionRow,
  MessageButton,
  MessageEmbed,
  Permissions,
  SnowflakeUtil,
} from "discord.js";

const now = performance.now;

class CommandSupport extends Module {
  constructor(bot: Bot) {
    super(bot);
    this.name = "commands-support";
  }

  clientReady() {
    this.logger.info("[💬] CommandSupport available!");
  }

  async interactionCreate(interaction: Interaction) {
    if (interaction.isCommand()) {
      const startAt = now();

      if (!interaction.channel || interaction.channel.type === "DM" || !interaction.guild) {
        const noDMsButton = new MessageActionRow().addComponents(
          new MessageButton()
            .setURL("https://eazyautodelete.xyz/invite/")
            .setStyle("LINK")
            .setLabel("Add EazyAutodelete")
        );

        const noDMsEmbed = new MessageEmbed()
          .setColor("#ff0000")
          .setTitle(":x: Not supported!")
          .setDescription("Commands via dm are not supported, you need to add EazyAutodelete to a server!");

        return await interaction
          .reply({
            embeds: [noDMsEmbed],
            components: [noDMsButton],
          })
          .catch(this.logger.error);
      }

      const message = new CommandMessage(this.bot, interaction);
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

      const missingBotPerms: bigint[] = [];
      const channel =
        interaction.channel || (await guild.channels.fetch(interaction.channelId).catch(this.logger.error));
      if (!channel) return;

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
        const botMissingPermsEmbed = new MessageEmbed()
          .setTimestamp()
          .setColor(this.bot.utils.getColor("default") as ColorResolvable)
          .setDescription(message.translate("config.missingBotPerms", channel.id, missingBotPerms.join(", ")))
          .setFooter({
            text: "Questions? => /help",
            iconURL:
              this.client.user!.avatarURL({
                dynamic: true,
              }) || "",
          });
        return await interaction.reply({
          embeds: [botMissingPermsEmbed],
          ephemeral: true,
        });
      }

      if (!this.bot.permissions.hasPermsToUseCommand(command, member, message.data.guild)) {
        const noPermsEmbed = new MessageEmbed()
          .setTimestamp()
          .setColor(this.bot.utils.getColor("error") as ColorResolvable)
          .setDescription(message.translate("config.missingPerms"))
          .setFooter({
            text: "EazyAutodelete",
            iconURL:
              this.client.user!.avatarURL({
                dynamic: true,
              }) || "",
          });

        return await interaction.reply({
          embeds: [noPermsEmbed],
          ephemeral: true,
        });
      }

      const cooldown = this.bot.cooldowns.hasCooldown(commandName, member.user.id);
      if (cooldown) {
        const cooldownEmbed = new MessageEmbed()
          .setTimestamp()
          .setColor(this.bot.utils.getColor("error") as ColorResolvable)
          .setDescription(message.translate("config.cooldown", cooldown + "ms"))
          .setFooter({
            text: "EazyAutodelete",
            iconURL:
              this.client.user!.avatarURL({
                dynamic: true,
              }) || "",
          });

        return await interaction.reply({
          embeds: [cooldownEmbed],
          ephemeral: true,
        });
      }

      await command.run(message, args);

      this.bot.cooldowns.setCooldown(commandName, member.user.id);

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
          content: "⏰ You can not use buttons older than 5 minutes.",
        });
        if (interaction.message instanceof Message && interaction.message.deletable)
          await interaction.message.delete().catch(this.logger.error);
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
    } else if (interaction.isButton()) {
      const created = SnowflakeUtil.deconstruct(interaction.message.id).timestamp;
      const dur = (new Date().getTime() - created) / 1000;

      if (dur >= 300) {
        await interaction.reply({
          ephemeral: true,
          content: "⏰ You can not use buttons older than 5 minutes.",
        });
        if (interaction.message instanceof Message && interaction.message.deletable)
          await interaction.message.delete().catch(this.logger.error);
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
