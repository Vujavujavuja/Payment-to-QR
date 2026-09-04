/**
 * Pack the library, install it somewhere else, and import it.
 *
 * Everything else in CI tests the source through a bundler that resolves
 * whatever it is pointed at. None of it would notice an exports map with a
 * wrong path, a `files` list that omits dist, or ESM output Node refuses to
 * load — the three ways a package that builds fine is still unusable.
 *
 * This also pins the promise the package makes about its dependencies: the
 * main entry must work with `qrcode` absent, because it is an optional peer
 * and the core is meant to carry no dependencies at all.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = resolve(fileURLToPath(new URL('../packages/ips-qr', import.meta.url)));
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const work = mkdtempSync(join(tmpdir(), 'ips-qr-verify-'));
let failed = false;
const check = (label, ok) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failed = true;
};

try {
  run('npm', ['run', 'build'], packageDir);
  run('npm', ['pack', '--pack-destination', work], packageDir);
  const tarball = join(work, readdirSync(work).find((f) => f.endsWith('.tgz')));

  run('npm', ['init', '-y'], work);
  run('npm', ['install', '--no-audit', '--no-fund', tarball], work);

  // 1. The main entry, with qrcode deliberately not installed.
  writeFileSync(
    join(work, 'core.mjs'),
    `import { encodePayment, validatePayment, normalizeAccount, isValidAccountChecksum } from 'ips-qr';
     const account = normalizeAccount('265-1234567890-98');
     const payment = { recipientAccount: account, recipientName: 'Test', amount: '3450.00', paymentCode: '189' };
     console.log(JSON.stringify({
       account,
       checksum: isValidAccountChecksum(account),
       valid: validatePayment(payment).valid,
       payload: encodePayment(payment).payload,
     }));`,
  );
  const core = JSON.parse(run('node', ['core.mjs'], work));
  check('main entry imports with no dependencies installed', true);
  check('account normalises', core.account === '265000123456789098');
  check('checksum verifies', core.checksum === true);
  check('payment validates', core.valid === true);
  check(
    'payload matches the spec',
    core.payload === 'K:PR|V:01|C:1|R:265000123456789098|N:Test|I:RSD3450,00|SF:189',
  );

  // 2. The QR entry, once its optional peer is present.
  run('npm', ['install', '--no-audit', '--no-fund', 'qrcode'], work);
  writeFileSync(
    join(work, 'qr.mjs'),
    `import { encodePayment } from 'ips-qr';
     import { renderPayloadToSvg } from 'ips-qr/qr';
     const { payload } = encodePayment({ recipientAccount: '265000123456789098', recipientName: 'Test', amount: '10.00', paymentCode: '189' });
     const svg = await renderPayloadToSvg(payload);
     console.log(JSON.stringify({ svg: svg.startsWith('<svg') && svg.includes('</svg>') }));`,
  );
  const qr = JSON.parse(run('node', ['qr.mjs'], work));
  check('qr subpath renders once its optional peer is installed', qr.svg === true);
} catch (error) {
  console.log(`  FAIL ${error.message.split('\n')[0]}`);
  if (error.stderr) console.log(String(error.stderr).split('\n').slice(0, 8).join('\n'));
  failed = true;
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(failed ? '\npackage verification failed' : '\npackage verification passed');
process.exit(failed ? 1 : 0);
