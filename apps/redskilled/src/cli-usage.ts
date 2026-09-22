import { LOGS_USAGE } from "./logs-command.js";
import { RESOURCE_INCIDENTS_USAGE } from "./resource-incidents-command.js";
import { REDSKILLED_WEB_USAGE } from "./web-launcher.js";

/**
 * Usage, as a CONSTANT — the answer owes nothing to the machine it is asked on.
 *
 * `--help` is asked under exactly the conditions `--version` is (#2918): the
 * daemon will not start, or the operator is hunting for the subcommand that
 * stops it. Deriving usage from a socket, a config file or a store makes the
 * subcommand list unavailable precisely when someone is lost, which is how a
 * one-second question became a detour during a version migration.
 */
export const REDSKILLED_USAGE = `Usage: redskilled <command> [options]

Commands:
  host-state (default)  print the host's state as JSON
  serve                 run the daemon in this process
  acp                   serve the daemon-owned RedSkills ACP Agent over stdio
  statusline [global]   render one agent-host status line
  dashboard [local]     the host's screen; local scopes it to this repo
  github-spend          report which operations spent GitHub budget
  incidents             list/show bounded CPU and memory forensic captures
  logs --path|--open     locate or open the daemon diagnostic log (offline)
  link                  connect Redskilled Mobile; prints a pairing URI and QR
  web                   serve and administer the HTTPS browser dashboard
  unit                  install | uninstall | status — the optional supervisor
  provision             make this machine ready; --check is the read-only half
  reclaim               clear runtime dirs left by dead sessions
  reap --report          census Worker processes and crash dumps without acting

Run \`redskilled <command> --help\` for a command's own usage.
\`--version\` (\`-v\`) prints the build stamp; both answer offline.
`;

/** Each subcommand's scoped usage — same contract, same offline answer. */
export const COMMAND_USAGE = {
  logs: LOGS_USAGE,
  serve: `Usage: redskilled serve [options]

Runs the daemon in this process. Every path is a flag and none is derived
(ADR 0130 rule 3); what is absent falls back to the session derivation.

  --socket <path>             the unix socket to listen on
  --lease <path>              the singleton lease record
  --events <path>             the append-only host event lane
  --session-key-hash <hex>    publishable session identity
  --machine-id-hash <hex>     publishable host label
  --machine-claim <path>      the machine-wide claim record
  --worker-ceiling <n>        host-wide Worker slots across every project
  --memory-ceiling <size>     host-wide Worker memory budget
  --daemon-version <v>        the version this daemon reports as
  --queue-endpoint <url>      where the queue poll asks; GitHub's when absent
  --queue-ms <n>              window between queue polls
  --demand-ms <n>             window between demand ticks

The poller is armed by a token in REDSKILLED_HOST_TOKEN (GITHUB_TOKEN or
GH_TOKEN when it is unset). With none, the daemon holds registrations and counts
no queue — an honest unknown, never a drained one.

Desktop sessions show the daemon in the system tray. Set REDSKILLED_TRAY=0 to
disable the icon without changing daemon or Worker behaviour.
`,
  acp: `Usage: redskilled acp

Projects the RedSkills ACP v1/v2 Agent; v2 requires schema-v2.0.0-alpha.2. The adapter
owns no session or Worker state; closing it does not stop the host daemon.
`,
  "acp-worker": `Usage: redskilled acp-worker --socket <path>

Internal launch edge for a daemon-admitted native ACP Worker.
`,
  "host-state": `Usage: redskilled host-state

Prints the host's state as JSON. Contacts the running daemon; the default
command when none is named.
`,
  dashboard: `Usage: redskilled dashboard [local] [flags]

Every project this host is watching, every Worker it holds, and how the last
48 hours have gone. The same payload and render as the statusline (ADR 0132
decision 1) — a density argument, never a second renderer. The project of the
directory you run it from is marked, never the only one shown.

  local           scope to this directory's project instead of the host
  --max-width N   hard ceiling in characters
  --verbose       expand recent death receipts

In a TTY it refreshes one stable screen and follows resize; in a pipe it writes
one snapshot. Press q to quit, r to refresh now, or v to toggle death details.
It always states an unreachable host and exits 0.`,
  "github-spend": `Usage: redskilled github-spend [--pool <pool|all>] [--hours <n>]

Reports what this host observed itself spending from GitHub's API budget,
grouped by operation key and Worker. Defaults to the GraphQL pool over the last
hour. This is durable process attribution, never GitHub's authoritative balance.

  --pool <pool|all>  graphql (default), rest, search, or every pool
  --hours <n>        positive number of hours ending now (default: 1)
`,
  incidents: RESOURCE_INCIDENTS_USAGE,
  link: `Usage: redskilled link [options]

Starts the supervised Remote link Host companion and creates a short-lived,
one-use Mobile pairing invitation. In a TTY it shows a QR, then prints the
connection URI and manual code. A configured Host may subsequently run this
command with no options.

  --relay <wss://url>       configure or replace the self-hosted relay URL
  --name <host-name>        name shown by Redskilled Mobile
  --transport <wss|wireguard>
                            WSS is available; WireGuard reports unavailable
  --allow-insecure-relay    permit ws:// only for local development
`,
  web: REDSKILLED_WEB_USAGE,
  statusline: `Usage: redskilled statusline [global] [--verbose] [flags]

Renders the status line the agent host prints verbatim. Config is read on this
side and only decided values cross the socket (ADR 0130 rule 10).

  global      render the host-wide line instead of this project's
  --verbose   add one line per Worker
`,
  unit: `Usage: redskilled unit [install|uninstall|status]

Manages the OPTIONAL user supervisor unit — auto-spawn is the floor, and a host
with no unit is a supported configuration (ADR 0130 rule 7). Defaults to status.
`,
  provision: `Usage: redskilled provision [--check] [--no-start] [--no-unit]
                          [--workspace <target>] [--project <dir>]

Makes a machine with no prior state ready, and prints the audit. Idempotent: a
second run creates nothing and reports the same verdicts.

Installs the always-on OS service (ADR 0150 §4) and starts the daemon through
it. The service carries no idle-exit tunable: once installed the daemon stays up
until an operator, a signal or a published replacement takes the session, and no
client ever starts one of its own.

The host-scoped state home is created only when a declared workspace target reads it
(the \`host\` preset, or a custom parent under the home). The daemon never reads
that state directory, so the default \`local\` preset needs none — and never gets
an empty one. Host policy is read separately from ~/.red/config.yaml.

  --check         read-only; creates, installs and starts nothing
  --no-start      make the host ready without starting the daemon
  --no-unit       skip the OS service; the host keeps whatever it already had
  --workspace <t> state the workspace target outright, instead of reading a config
  --project <dir> the repository whose config declares the target (default: cwd)
`,
  stop: `Usage: redskilled stop [--detail <why>]

Asks the daemon to shut down and reports what it was holding. Every Worker
survives: they are init-system units, so a stop is a restart and not an
evacuation. A socket nobody answers on is a success with a stated reason.

  --detail <why>  the operator's own words, recorded on the event lane so a
                  successor can tell a planned handover from a crash
`,
  reclaim: `Usage: redskilled reclaim [--dry-run] [--grace-ms <n>] [--projects]

Reports every session runtime dir it looked at and why it kept or removed it.

  --dry-run        the same report with nothing removed
  --grace-ms <n>   how long a dir must be idle before it is reclaimed
  --projects       sweep local-* project workspaces whose seeding checkout is
                   gone, instead of the session runtime dirs
`,
  reap: `Usage: redskilled reap [--report]

Runs the daemon's orphan-process census immediately. The default applies the
same stamped-orphan reaper the daemon runs periodically; --report is the
detection-only incident view and performs no adoption, signalling, or deletion.

  --report   return counts only; signal and delete nothing
`,
} as const satisfies Record<string, string>;
