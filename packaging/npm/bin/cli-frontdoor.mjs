import { readBuildInfo, renderVersion } from './build-info.mjs';
export function cliFrontdoor(name, usage, argv = process.argv.slice(2)) {
  const [flag] = argv;
  if (flag === '--version' || flag === '-v') {
    console.log(renderVersion(readBuildInfo(name)));
    process.exit(0);
  }
  if (flag === '--help' || flag === '-h') {
    const USAGE = `Usage: ${name} ${usage}`;
    console.log(USAGE);
    process.exit(0);
  }
  return argv;
}
