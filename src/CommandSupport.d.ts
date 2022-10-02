import { Bot, Module } from "@eazyautodelete/core";
import { Interaction } from "discord.js";
declare class CommandSupport extends Module {
    constructor(bot: Bot);
    clientReady(): void;
    interactionCreate(interaction: Interaction): Promise<void>;
}
export default CommandSupport;
