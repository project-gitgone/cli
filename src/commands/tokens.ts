import { Command } from "commander";
import prompts from "prompts";
import ora from "ora";
import chalk from "chalk";
import { nanoid } from "nanoid";
import { apiClient } from "../lib/api.js";
import { getLocalConfig, getConfig } from "../lib/config.js";
import {
  decryptVault,
  decryptProjectKey,
  encryptWithToken,
} from "../lib/crypto.js";

export const tokensCommand = new Command("tokens").description(
  "Manage project tokens",
);

tokensCommand
  .command("list")
  .description("List all project tokens")
  .action(async () => {
    const localConfig = getLocalConfig();
    if (!localConfig || !localConfig.projectId) {
      console.log(
        chalk.red('No linked project found. Run "gitgone link" first.'),
      );
      return;
    }

    const spinner = ora("Fetching tokens...").start();
    try {
      const tokens: any[] = await apiClient(
        `/api/projects/${localConfig.projectId}/tokens`,
      );
      spinner.stop();

      if (tokens.length === 0) {
        console.log(chalk.yellow("No tokens found for this project."));
        return;
      }

      console.log(chalk.bold("\nProject Tokens:"));
      console.log("".padEnd(70, "-"));
      tokens.forEach((t) => {
        const expires = t.expiresAt
          ? new Date(t.expiresAt).toLocaleDateString()
          : "Never";
        console.log(
          `${chalk.green(t.name.padEnd(20))} | Env: ${chalk.blue(t.environment.padEnd(12))} | Expires: ${expires.padEnd(12)} | ID: ${t.id}`,
        );
      });
      console.log("".padEnd(70, "-"));
    } catch (error: any) {
      spinner.fail(`Failed to fetch tokens: ${error.message}`);
    }
  });

tokensCommand
  .command("create")
  .description("Create a new project token")
  .argument("<name>", "Name of the token (e.g. CI_PROD)")
  .option(
    "-e, --env <environment>",
    "Environment (development, staging, production)",
    "development",
  )
  .action(async (name, options) => {
    const localConfig = getLocalConfig();
    if (!localConfig || !localConfig.projectId) {
      console.log(
        chalk.red('No linked project found. Run "gitgone link" first.'),
      );
      return;
    }

    const passwordRes = await prompts({
      type: "password",
      name: "password",
      message: "Enter YOUR password to unlock your vault and project key",
    });

    if (!passwordRes.password) return;

    const spinner = ora("Generating token...").start();
    try {
      const config = getConfig();
      if (!config.encryptedPrivateKey || !config.keySalt) {
        throw new Error("Your local vault is missing. Please login again.");
      }

      const privateKey = decryptVault(
        config.encryptedPrivateKey,
        passwordRes.password,
        config.keySalt,
      );
      const myKeyData: any = await apiClient(
        `/api/keys/${localConfig.projectId}`,
      );
      const projectKey = decryptProjectKey(myKeyData.encryptedKey, privateKey);

      const tokenSecret = nanoid(32);

      const encryptedProjectKey = encryptWithToken(projectKey, tokenSecret);

      const result = await apiClient(
        `/api/projects/${localConfig.projectId}/tokens`,
        {
          method: "POST",
          body: JSON.stringify({
            name,
            environment: options.env,
            tokenSecretHash: tokenSecret,
            encryptedProjectKey: encryptedProjectKey,
          }),
        },
      );

      spinner.succeed(`Token "${name}" created.`);

      const finalToken = `${result.id}.${tokenSecret}`;

      console.log(
        "\n" +
          chalk.bgGreen.black(" IMPORTANT ") +
          " Copy this token now, it will not be shown again:",
      );
      console.log(chalk.bold.green(`\n  ${finalToken}\n`));
      console.log(
        `Use it with the GitGone library: ${chalk.cyan(`GITGONE_TOKEN=${finalToken}`)}`,
      );
    } catch (error: any) {
      spinner.fail(`Failed to create token: ${error.message}`);
    }
  });

tokensCommand
  .command("delete")
  .description("Delete a project token")
  .argument("<id>", "Token ID to delete")
  .action(async (id) => {
    const confirm = await prompts({
      type: "confirm",
      name: "value",
      message: `Are you sure you want to delete token ${id}?`,
      initial: false,
    });

    if (!confirm.value) return;

    const spinner = ora("Deleting token...").start();
    try {
      await apiClient(`/api/projects/tokens/${id}`, {
        method: "DELETE",
      });
      spinner.succeed("✅ Token deleted.");
    } catch (error: any) {
      spinner.fail(`Failed to delete token: ${error.message}`);
    }
  });
