const mockStore = new Map<string, string>();
const mockServer: {backup: {publicKey: string; secretKey: string} | null; members: {userId: string; publicKey: string}[]} = {
  backup: null,
  members: [],
};

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
  multiGet: jest.fn(async (keys: string[]) => keys.map(k => [k, mockStore.get(k) ?? null])),
  multiSet: jest.fn(async (pairs: [string, string][]) => { pairs.forEach(([k, v]) => mockStore.set(k, v)); }),
}));

jest.mock('../src/services/SecureStorage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore.get(`secure:${k}`) ?? null),
    setItem: jest.fn(async (k: string, v: string) => { mockStore.set(`secure:${k}`, v); }),
    removeItem: jest.fn(),
  },
}));

jest.mock('../src/services/ApiClient', () => ({
  __esModule: true,
  default: {post: (...args: any[]) => mockPost(...args), get: (...args: any[]) => mockGet(...args)},
}));

const mockPost = jest.fn();
const mockGet = jest.fn();

type Service = typeof import('../src/services/E2EEService').default;

const loadService = (): Service => {
  let service!: Service;
  jest.isolateModules(() => {
    service = require('../src/services/E2EEService').default;
  });
  return service;
};

const login = (id: string) => mockStore.set('@current_user', JSON.stringify({id}));
const reinstall = () => mockStore.clear();

beforeEach(() => {
  mockStore.clear();
  mockServer.backup = null;
  mockServer.members = [];
  mockPost.mockReset().mockImplementation(async (url: string, body: any) => {
    if (url.includes('e2ee-backup')) {
      if (!mockServer.backup) {
        mockServer.backup = {publicKey: body.publicKey, secretKey: body.secretKey};
      }
      return {data: mockServer.backup};
    }
    throw new Error('unexpected ' + url);
  });
  mockGet.mockReset().mockImplementation(async (url: string) => {
    if (url.includes('member-keys')) {
      return {data: mockServer.members};
    }
    throw new Error('unexpected ' + url);
  });
});

describe('E2EEService key backup', () => {
  it('restores the same key pair after a reinstall', async () => {
    login('alice');
    const first = await loadService().ensureRegisteredKeyPair();

    reinstall();
    login('alice');
    const restored = await loadService().ensureRegisteredKeyPair();

    expect(restored).toEqual(first);
  });

  it('decrypts history after a reinstall', async () => {
    login('alice');
    const before = loadService();
    const {payloads} = await before.buildGroupPayloads('g1', 'hello');
    const mine = payloads.find(p => p.userId === 'alice')!;

    reinstall();
    login('alice');
    const after = loadService();
    expect(await after.decryptPayload(mine)).toBe('hello');
  });

  it('never generates a replacement key when the backup is unreachable on a fresh install', async () => {
    login('alice');
    mockPost.mockRejectedValueOnce(new Error('offline'));

    await expect(loadService().ensureRegisteredKeyPair()).rejects.toThrow('offline');
    expect(mockServer.backup).toBeNull();
  });

  it('adopts the account key and keeps the previous one to read older messages', async () => {
    login('alice');
    const device = loadService();
    const {payloads} = await device.buildGroupPayloads('g1', 'old message');
    const oldPayload = payloads.find(p => p.userId === 'alice')!;

    // Le compte référence une autre clé (enregistrée par un autre appareil)
    const nacl = require('tweetnacl');
    const naclUtil = require('tweetnacl-util');
    const accountPair = nacl.box.keyPair();
    mockServer.backup = {
      publicKey: naclUtil.encodeBase64(accountPair.publicKey),
      secretKey: naclUtil.encodeBase64(accountPair.secretKey),
    };

    const service = loadService();
    expect(await service.ensureRegisteredKeyPair()).toEqual(mockServer.backup);
    expect(await service.decryptPayload(oldPayload)).toBe('old message');
  });
});

describe('E2EEService groups', () => {
  it('encrypts for every member with a key and lets each one decrypt only their payload', async () => {
    const nacl = require('tweetnacl');
    const naclUtil = require('tweetnacl-util');
    const bob = nacl.box.keyPair();
    mockServer.members = [{userId: 'bob', publicKey: naclUtil.encodeBase64(bob.publicKey)}];

    login('alice');
    const alice = loadService();
    const {encryptionVersion, payloads} = await alice.buildGroupPayloads('g1', 'secret');

    expect(encryptionVersion).toBe('e2ee-v1');
    expect(payloads.map(p => p.userId).sort()).toEqual(['alice', 'bob']);
    expect(JSON.stringify(payloads)).not.toContain('secret');

    const forBob = payloads.find(p => p.userId === 'bob')!;
    const opened = nacl.box.open(
      naclUtil.decodeBase64(forBob.ciphertext),
      naclUtil.decodeBase64(forBob.nonce),
      naclUtil.decodeBase64(forBob.ephemeralPublicKey),
      bob.secretKey,
    );
    expect(naclUtil.encodeUTF8(opened)).toBe('secret');

    const forAlice = payloads.find(p => p.userId === 'alice')!;
    expect(await alice.decryptPayload(forAlice)).toBe('secret');
  });
});
