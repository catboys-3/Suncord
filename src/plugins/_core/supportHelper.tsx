/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import ErrorBoundary from "@components/ErrorBoundary";
import { Link } from "@components/Link";
import { openUpdaterModal } from "@components/VencordSettings/UpdaterTab";
import { Devs, SUPPORT_CHANNEL_ID } from "@utils/constants";
import { Margins } from "@utils/margins";
import { isPluginDev, isSuncordPluginDev } from "@utils/misc";
import { relaunch } from "@utils/native";
import { makeCodeblock } from "@utils/text";
import definePlugin from "@utils/types";
import { isOutdated, update } from "@utils/updater";
import { Alerts, Card, ChannelStore, Forms, GuildMemberStore, NavigationRouter, Parser, RelationshipStore, UserStore } from "@webpack/common";

import gitHash from "~git-hash";
import plugins from "~plugins";

import settings from "./settings";

const SUNCORD_GUILD_ID = "1207691698386501634";

const AllowedChannelIds = [
    SUPPORT_CHANNEL_ID,
    "1234590013140893910",
];

const TrustedRolesIds = [
    "1230686080102301717",
    "1230697605642584116",
    "1230686049513111695",
];

export default definePlugin({
    name: "SupportHelper",
    required: true,
    description: "Helps us provide support to you",
    authors: [Devs.Ven],
    dependencies: ["CommandsAPI"],

    patches: [{
        find: ".BEGINNING_DM.format",
        replacement: {
            match: /BEGINNING_DM\.format\(\{.+?\}\),(?=.{0,100}userId:(\i\.getRecipientId\(\)))/,
            replace: "$& $self.ContributorDmWarningCard({ userId: $1 }),"
        }
    }],

    commands: [{
        name: "suncord-debug",
        description: "Send Suncord Debug info",
        predicate: ctx => isPluginDev(UserStore.getCurrentUser()?.id) || isSuncordPluginDev(UserStore.getCurrentUser()?.id) || AllowedChannelIds.includes(ctx.channel.id),
        async execute() {
            const { RELEASE_CHANNEL } = window.GLOBAL_ENV;

            const client = (() => {
                if (IS_DISCORD_DESKTOP) return `Discord Desktop v${DiscordNative.app.getVersion()}`;
                if (IS_VESKTOP) return `Vesktop v${VesktopNative.app.getVersion()}`;
                if ("armcord" in window) return `ArmCord v${window.armcord.version}`;

                // @ts-expect-error
                const name = typeof unsafeWindow !== "undefined" ? "UserScript" : "Web";
                return `${name} (${navigator.userAgent})`;
            })();

            const isApiPlugin = (plugin: string) => plugin.endsWith("API") || plugins[plugin].required;

            const enabledPlugins = Object.keys(plugins).filter(p => Vencord.Plugins.isPluginEnabled(p) && !isApiPlugin(p));

            const info = {
                Suncord:
                    `v${VERSION} • [${gitHash}](<https://github.com/verticalsync/Suncord/commit/${gitHash}>)` +
                    `${settings.additionalInfo} - ${Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(BUILD_TIMESTAMP)}`,
                Client: `${RELEASE_CHANNEL} ~ ${client}`,
                Platform: window.navigator.platform
            };

            if (IS_DISCORD_DESKTOP) {
                info["Last Crash Reason"] = (await DiscordNative.processUtils.getLastCrash())?.rendererCrashReason ?? "N/A";
            }

            const debugInfo = `
>>> ${Object.entries(info).map(([k, v]) => `**${k}**: ${v}`).join("\n")}

Enabled Plugins (${enabledPlugins.length}):
${makeCodeblock(enabledPlugins.join(", "))}
`;

            return {
                content: debugInfo.trim().replaceAll("```\n", "```")
            };
        }
    }],

    flux: {
        async CHANNEL_SELECT({ channelId }) {
            if (channelId !== SUPPORT_CHANNEL_ID) return;

            const selfId = UserStore.getCurrentUser()?.id;
            if (!selfId || isPluginDev(selfId) || isSuncordPluginDev(selfId)) return;

            if (isOutdated) {
                return Alerts.show({
                    title: "Hold on!",
                    body: <div>
                        <Forms.FormText>You are using an outdated version of Suncord! Chances are, your issue is already fixed.</Forms.FormText>
                        <Forms.FormText className={Margins.top8}>
                            Please first update before asking for support!
                        </Forms.FormText>
                    </div>,
                    onCancel: () => openUpdaterModal!(),
                    cancelText: "View Updates",
                    confirmText: "Update & Restart Now",
                    async onConfirm() {
                        await update();
                        relaunch();
                    },
                    secondaryConfirmText: "I know what I'm doing or I can't update"
                });
            }

            // @ts-ignore outdated type
            // eslint-disable-next-line no-unsafe-optional-chaining
            const roles = GuildMemberStore.getSelfMember(SUNCORD_GUILD_ID)?.roles;
            if (!roles || TrustedRolesIds.some(id => roles.includes(id))) return;

            if (!IS_WEB && IS_UPDATER_DISABLED) {
                return Alerts.show({
                    title: "Hold on!",
                    body: <div>
                        <Forms.FormText>You are using an externally updated Suncord version, which we do not provide support for!</Forms.FormText>
                        <Forms.FormText className={Margins.top8}>
                            Please either switch to an <Link href="https://github.com/verticalsync/Suncord">officially supported version of Suncord</Link>, or
                            contact your package maintainer for support instead.
                        </Forms.FormText>
                    </div>,
                    onCloseCallback: () => setTimeout(() => NavigationRouter.back(), 50)
                });
            }

            const repo = await VencordNative.updater.getRepo();
            if (repo.ok && !repo.value.includes("verticalsync/Suncord")) {
                return Alerts.show({
                    title: "Hold on!",
                    body: <div>
                        <Forms.FormText>You are using a fork of Suncord, which we do not provide support for!</Forms.FormText>
                        <Forms.FormText className={Margins.top8}>
                            Please either switch to an <Link href="https://github.com/verticalsync/Suncord">officially supported version of Suncord</Link>, or
                            contact your package maintainer for support instead.
                        </Forms.FormText>
                    </div>,
                    onCloseCallback: () => setTimeout(() => NavigationRouter.back(), 50)
                });
            }
        }
    },

    ContributorDmWarningCard: ErrorBoundary.wrap(({ userId }) => {
        if (!isPluginDev(userId) || !isSuncordPluginDev(userId)) return null;
        if (RelationshipStore.isFriend(userId)) return null;

        return (
            <Card className={`vc-plugins-restart-card ${Margins.top8}`}>
                Please do not private message Suncord plugin developers for support!
                <br />
                Instead, use the Suncord support channel: {Parser.parse("https://discord.com/channels/1207691698386501634/1217501200761622641")}
                {!ChannelStore.getChannel(SUPPORT_CHANNEL_ID) && " (Click the link to join)"}
            </Card>
        );
    }, { noop: true })
});
