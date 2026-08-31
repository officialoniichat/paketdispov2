// @vitest-environment jsdom
/**
 * Deckt zwei Dinge ab:
 *
 * 1. `runMilestone` (commit/rollback, siehe Modul-Doku in `useCaseFlow.ts`): eine
 *    Meilenstein-Aktion (hier `complete()`) patcht den `['me','today']`-Cache
 *    optimistisch, wartet den echten POST ab und bestätigt (Erfolg) oder rollt
 *    zurück und zeigt `actionError` (Fehler) — nie stillschweigend.
 * 2. Die SERVER-HAKEN der Beleg-Zusammenarbeit (31.08.2026): „Position geprüft"
 *    und die Mengen-Erfassung sind eigene Endpunkte. Sie warten den Start-
 *    Übergang ab (sonst antwortet das Backend mit 409), patchen den
 *    Aggregat-Cache optimistisch und rollen bei Fehler zurück.
 */
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { components } from '@paket/api-client';
import { useCaseFlow } from './useCaseFlow.js';
import * as apiModule from '../data/api.js';
import { clearSession, setSession } from '../data/session.js';

type CaseAggregateDto = components['schemas']['CaseAggregateDto'];
type TodayResponseDto = components['schemas']['TodayResponseDto'];

const CASE_ID = 'case-1';
const TODAY_KEY = ['me', 'today'] as const;
const AGGREGATE_KEY = ['me', 'case', CASE_ID, 'aggregate'] as const;

const CONFIRM_PATH = '/api/cases/{caseId}/positions/{positionId}/confirmed';
const COUNT_PATH = '/api/cases/{caseId}/sku-lines/{skuLineId}/count';
const START_PATH = '/api/cases/{caseId}/start-preparation';
const PART_DONE_PATH = '/api/me/cases/{caseId}/part-done';

/** Minimal but structurally valid aggregate DTO — only fields the mapper reads. */
function aggregateDto(status: string): CaseAggregateDto {
  return {
    case: {
      id: CASE_ID,
      weBelegNo: '1234567',
      bookingDate: '2026-07-06',
      branchNo: '1',
      totalQuantity: 1,
      status,
      estimatedMinutes: 5,
      attentionFlag: false,
      missingFields: [],
      priorityFlags: [],
    },
    workInstruction: {
      priceLabelPrintRequired: false,
      sortByArticleColorSizeRequired: false,
      goodsReceiptCheckMode: 'quantity_only',
      boxLabelRequired: false,
      zstRequired: true,
    },
    positions: [
      {
        id: 'pos-1',
        positionNo: 1,
        wgr: '218110',
        supplierArticleNo: 'art-1',
        supplierColor: 'black',
        branchNo: '1',
        shopNo: '2143',
        instruction: {
          labelPrintVariant: 'kein_etikett',
          priceLabelAttachRequired: false,
          securityRequired: false,
          onlineHandlingRequired: false,
        },
        skuLines: [
          {
            id: 'sku-1',
            ean: '4000000000001',
            size: '9',
            expectedQuantity: 1,
            status: 'open',
          },
        ],
        status: 'open',
      },
    ],
    boxTargets: [],
    instructionPoints: [],
    issues: [],
  } as unknown as CaseAggregateDto;
}

const AGGREGATE_DTO = aggregateDto('in_progress');

function todayDto(status: string): TodayResponseDto {
  return {
    date: '2026-07-06',
    cases: [
      {
        id: CASE_ID,
        weBelegNo: '1234567',
        status,
      },
    ],
  } as unknown as TodayResponseDto;
}

const TODAY_DTO = todayDto('in_progress');

function makeClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** The cached case's status, or undefined — avoids unchecked index access on `.cases[0]`. */
function cachedCaseStatus(client: QueryClient): string | undefined {
  return client.getQueryData<TodayResponseDto>(TODAY_KEY)?.cases[0]?.status;
}

/** Erste Position aus dem Aggregat-Cache (die optimistisch gepatchte Wahrheit). */
function cachedPosition(client: QueryClient) {
  return client.getQueryData<CaseAggregateDto>(AGGREGATE_KEY)?.positions[0];
}

function cachedSkuLine(client: QueryClient) {
  return cachedPosition(client)?.skuLines[0];
}

/** Pfade aller abgesetzten POSTs, in Reihenfolge. */
function postedPaths(mockPost: ReturnType<typeof vi.fn>): string[] {
  return mockPost.mock.calls.map((call) => call[0] as string);
}

function mockApi(status: string, post: ReturnType<typeof vi.fn>) {
  const mockGet = vi.fn().mockResolvedValue({
    data: aggregateDto(status),
    error: undefined,
    response: { status: 200 },
  });
  vi.spyOn(apiModule, 'getApiClient').mockReturnValue({
    GET: mockGet,
    POST: post,
  } as unknown as ReturnType<typeof apiModule.getApiClient>);
  return mockGet;
}

/** Wie {@link mockApi}, aber mit einem angepassten Aggregat-DTO (geteilter Beleg). */
function mockApiWith(dto: CaseAggregateDto, post: ReturnType<typeof vi.fn>) {
  vi.spyOn(apiModule, 'getApiClient').mockReturnValue({
    GET: vi.fn().mockResolvedValue({ data: dto, error: undefined, response: { status: 200 } }),
    POST: post,
  } as unknown as ReturnType<typeof apiModule.getApiClient>);
}

type SkuLineDto = CaseAggregateDto['positions'][number]['skuLines'][number];

/** Standard-POST-Mock: jede Aktion gelingt. */
function okPost() {
  return vi.fn().mockResolvedValue({
    data: { caseId: CASE_ID, status: 'in_progress', version: 1 },
    error: undefined,
    response: { status: 200 },
  });
}

/**
 * POST-Mock, dessen Aufruf auf `deferredPath` erst auf Kommando antwortet — nur
 * so ist der OPTIMISTISCHE Zwischenzustand beobachtbar: sobald der Server
 * geantwortet hat, lädt `onSettled` das Aggregat neu und die Server-Wahrheit
 * überschreibt den Patch.
 */
function deferredPost(deferredPath: string) {
  let release!: () => void;
  const pending = new Promise((resolve) => {
    release = () =>
      resolve({
        data: { caseId: CASE_ID, status: 'in_progress', version: 1 },
        error: undefined,
        response: { status: 200 },
      });
  });
  const post = vi.fn().mockImplementation((path: string) =>
    path === deferredPath
      ? pending
      : Promise.resolve({
          data: { caseId: CASE_ID, status: 'in_progress', version: 1 },
          error: undefined,
          response: { status: 200 },
        }),
  );
  return { post, release };
}

beforeEach(() => {
  localStorage.clear();
  setSession({
    token: 't',
    employeeNo: 'ma-9',
    displayName: 'Hakan Yilmaz',
    exp: Date.now() / 1000 + 3600,
  });
});

afterEach(() => {
  clearSession();
  vi.restoreAllMocks();
});

describe('useCaseFlow — runMilestone commit/rollback (complete())', () => {
  it('confirms the optimistic status patch once the POST succeeds', async () => {
    const client = makeClient();
    client.setQueryData(TODAY_KEY, TODAY_DTO);

    const mockGet = vi.fn().mockResolvedValue({
      data: AGGREGATE_DTO,
      error: undefined,
      response: { status: 200 },
    });
    // Deferred so the test can observe the optimistic state before the POST resolves.
    let resolvePost!: (value: { data: unknown; error: undefined }) => void;
    const postPromise = new Promise((resolve) => {
      resolvePost = resolve;
    });
    const mockPost = vi.fn().mockReturnValue(postPromise);
    vi.spyOn(apiModule, 'getApiClient').mockReturnValue({
      GET: mockGet,
      POST: mockPost,
    } as unknown as ReturnType<typeof apiModule.getApiClient>);

    const { result } = renderHook(() => useCaseFlow(CASE_ID), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.progress).toBeDefined());

    let completePromise!: Promise<boolean>;
    act(() => {
      completePromise = result.current.complete();
    });

    // Optimistic patch already applied — before the POST has resolved.
    await waitFor(() => expect(cachedCaseStatus(client)).toBe('completed'));

    resolvePost({ data: { caseId: CASE_ID, status: 'completed', version: 1 }, error: undefined });
    const ok = await completePromise;

    expect(ok).toBe(true);
    // Confirmed, not rolled back, after the mutation settles.
    expect(cachedCaseStatus(client)).toBe('completed');
    await waitFor(() => expect(result.current.actionError).toBeUndefined());
  });

  it('rolls back the optimistic patch and surfaces actionError when the POST fails', async () => {
    const client = makeClient();
    client.setQueryData(TODAY_KEY, TODAY_DTO);

    const mockGet = vi.fn().mockResolvedValue({
      data: AGGREGATE_DTO,
      error: undefined,
      response: { status: 200 },
    });
    const mockPost = vi.fn().mockResolvedValue({ data: undefined, error: { message: 'boom' } });
    vi.spyOn(apiModule, 'getApiClient').mockReturnValue({
      GET: mockGet,
      POST: mockPost,
    } as unknown as ReturnType<typeof apiModule.getApiClient>);

    const { result } = renderHook(() => useCaseFlow(CASE_ID), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.progress).toBeDefined());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.complete();
    });

    expect(ok).toBe(false);
    // Rolled back to the pre-mutation status, not left on the optimistic value.
    expect(cachedCaseStatus(client)).toBe('in_progress');
    await waitFor(() => expect(result.current.actionError).toBeTruthy());
    expect(result.current.actionError?.length).toBeGreaterThan(0);
  });

  it('sendet NUR berührte Größenzeilen (Konzept §7) — unberührt bleibt leer', async () => {
    const client = makeClient();
    client.setQueryData(TODAY_KEY, TODAY_DTO);
    const mockPost = okPost();
    mockApi('in_progress', mockPost);

    const { result } = renderHook(() => useCaseFlow(CASE_ID), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.progress).toBeDefined());

    await act(async () => {
      await result.current.complete();
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/api/cases/{caseId}/complete',
      expect.objectContaining({ body: { skuQuantities: [] } }),
    );
  });
});

describe('useCaseFlow — „Position geprüft" ist ein Server-Haken', () => {
  it('startet den Beleg und setzt den Haken danach per POST (optimistisch)', async () => {
    const client = makeClient();
    client.setQueryData(TODAY_KEY, todayDto('assigned'));
    const { post: mockPost, release } = deferredPost(CONFIRM_PATH);
    mockApi('assigned', mockPost);

    const { result } = renderHook(() => useCaseFlow(CASE_ID), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.progress).toBeDefined());
    expect(cachedPosition(client)?.confirmedBy).toBeUndefined();

    let toggled!: Promise<void>;
    act(() => {
      toggled = result.current.togglePositionChecked('pos-1');
    });

    // Optimistisch: der Prüfer bin bis zur Server-Antwort ich selbst.
    await waitFor(() =>
      expect(cachedPosition(client)?.confirmedBy).toEqual({
        employeeNo: 'ma-9',
        displayName: 'Hakan Yilmaz',
      }),
    );
    await act(async () => {
      release();
      await toggled;
    });

    // Erst der Start-Übergang, DANN der Haken — andernfalls 409 („nicht in Bearbeitung").
    expect(postedPaths(mockPost)).toEqual([START_PATH, CONFIRM_PATH]);
    expect(mockPost).toHaveBeenCalledWith(
      CONFIRM_PATH,
      expect.objectContaining({
        params: { path: { caseId: CASE_ID, positionId: 'pos-1' } },
        body: { confirmed: true },
      }),
    );
  });

  it('nimmt einen gesetzten Haken zurück (confirmed: false)', async () => {
    const client = makeClient();
    client.setQueryData(TODAY_KEY, TODAY_DTO);
    const { post: mockPost, release } = deferredPost(CONFIRM_PATH);
    const dto = aggregateDto('in_progress');
    dto.positions[0]!.confirmedBy = { employeeNo: 'ma-1', displayName: 'Anna Berger' };
    vi.spyOn(apiModule, 'getApiClient').mockReturnValue({
      GET: vi.fn().mockResolvedValue({ data: dto, error: undefined, response: { status: 200 } }),
      POST: mockPost,
    } as unknown as ReturnType<typeof apiModule.getApiClient>);

    const { result } = renderHook(() => useCaseFlow(CASE_ID), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.progress).toBeDefined());

    let toggled!: Promise<void>;
    act(() => {
      toggled = result.current.togglePositionChecked('pos-1');
    });
    // Optimistisch ist der Haken sofort weg — der Prüfer verschwindet.
    await waitFor(() => expect(cachedPosition(client)?.confirmedBy).toBeNull());
    await act(async () => {
      release();
      await toggled;
    });

    expect(mockPost).toHaveBeenCalledWith(
      CONFIRM_PATH,
      expect.objectContaining({ body: { confirmed: false } }),
    );
  });

  it('rollt zurück und zeigt den deutschen Fehlertext des Backends (409)', async () => {
    const client = makeClient();
    client.setQueryData(TODAY_KEY, TODAY_DTO);
    const mockPost = vi.fn().mockResolvedValue({
      data: undefined,
      error: { message: 'Der Beleg ist nicht in Bearbeitung.' },
      response: { status: 409 },
    });
    mockApi('in_progress', mockPost);

    const { result } = renderHook(() => useCaseFlow(CASE_ID), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.progress).toBeDefined());

    await act(async () => {
      await result.current.togglePositionChecked('pos-1');
    });

    await waitFor(() =>
      expect(result.current.actionError).toBe('Der Beleg ist nicht in Bearbeitung.'),
    );
    // Zurückgerollt: der Haken bleibt nicht optimistisch stehen.
    expect(cachedPosition(client)?.confirmedBy).toBeUndefined();
  });

  it('stößt den Start-Übergang kein zweites Mal an', async () => {
    const client = makeClient();
    client.setQueryData(TODAY_KEY, todayDto('assigned'));
    const mockPost = okPost();
    mockApi('assigned', mockPost);

    const { result } = renderHook(() => useCaseFlow(CASE_ID), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.progress).toBeDefined());

    await act(async () => {
      await result.current.togglePositionChecked('pos-1');
    });
    await act(async () => {
      await result.current.togglePositionChecked('pos-1');
    });

    expect(postedPaths(mockPost).filter((path) => path === START_PATH)).toHaveLength(1);
  });
});

describe('useCaseFlow — Mengen-/Preis-Erfassung (entprellt, serverseitig)', () => {
  it('patcht sofort und schickt die Ist-Menge nach der Entprellung', async () => {
    const client = makeClient();
    client.setQueryData(TODAY_KEY, TODAY_DTO);
    const mockPost = okPost();
    mockApi('in_progress', mockPost);

    const { result } = renderHook(() => useCaseFlow(CASE_ID), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.progress).toBeDefined());

    act(() => {
      result.current.setSkuQuantity('sku-1', 2, 1);
    });
    // Sofort im Cache (kein Warten auf den Server) …
    expect(cachedSkuLine(client)?.confirmedQuantity).toBe(2);
    expect(mockPost).not.toHaveBeenCalled();

    // … der POST folgt entprellt — als TEIL-Update nur mit dem berührten Feld
    // (eine fremde Preiskorrektur bliebe so unangetastet).
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        COUNT_PATH,
        expect.objectContaining({
          params: { path: { caseId: CASE_ID, skuLineId: 'sku-1' } },
          body: { confirmedQuantity: 2 },
        }),
      ),
    );
  });

  it('setzt die Erfassung zurück, sobald Ist = Soll ist (null)', async () => {
    const client = makeClient();
    client.setQueryData(TODAY_KEY, TODAY_DTO);
    const mockPost = okPost();
    mockApi('in_progress', mockPost);

    const { result } = renderHook(() => useCaseFlow(CASE_ID), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.progress).toBeDefined());

    act(() => {
      result.current.setSkuQuantity('sku-1', 1, 1);
    });
    expect(cachedSkuLine(client)?.confirmedQuantity).toBeNull();
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        COUNT_PATH,
        expect.objectContaining({ body: { confirmedQuantity: null } }),
      ),
    );
  });

  it('bündelt schnelle Tipper zu EINEM Request mit dem letzten Wert', async () => {
    const client = makeClient();
    client.setQueryData(TODAY_KEY, TODAY_DTO);
    const mockPost = okPost();
    mockApi('in_progress', mockPost);

    const { rerender, result } = renderHook(() => useCaseFlow(CASE_ID), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(result.current.progress).toBeDefined());

    act(() => {
      result.current.setSkuQuantity('sku-1', 2, 1);
      result.current.setSkuQuantity('sku-1', 3, 1);
      result.current.setSkuQuantity('sku-1', 4, 1);
    });

    // Ein Rendern zwischendurch (der optimistische Patch löst eines aus) darf die
    // Entprellung NICHT vorzeitig auslösen.
    rerender();
    expect(mockPost).not.toHaveBeenCalled();

    await waitFor(() => expect(postedPaths(mockPost)).toContain(COUNT_PATH));
    expect(postedPaths(mockPost).filter((path) => path === COUNT_PATH)).toHaveLength(1);
    expect(mockPost).toHaveBeenCalledWith(
      COUNT_PATH,
      expect.objectContaining({ body: { confirmedQuantity: 4 } }),
    );
  });

  it('schickt eine Preiskorrektur mit; der Etikettpreis selbst ist keine', async () => {
    const client = makeClient();
    client.setQueryData(TODAY_KEY, TODAY_DTO);
    const mockPost = okPost();
    mockApi('in_progress', mockPost);

    const { result } = renderHook(() => useCaseFlow(CASE_ID), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.progress).toBeDefined());

    act(() => {
      result.current.setCorrectedVkPrice('sku-1', 19.99, 24.99);
    });
    expect(cachedSkuLine(client)?.correctedVkPrice).toBe(19.99);
    // Teil-Update: die (nicht berührte) Ist-Menge fehlt im Request — eine
    // frische Zählung eines anderen Beteiligten bliebe so unangetastet.
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        COUNT_PATH,
        expect.objectContaining({ body: { correctedVkPrice: 19.99 } }),
      ),
    );

    act(() => {
      result.current.setCorrectedVkPrice('sku-1', 24.99, 24.99);
    });
    expect(cachedSkuLine(client)?.correctedVkPrice).toBeNull();
  });

  it('sendet den zuletzt getippten Wert, auch wenn ein Refetch den Cache im Entprell-Fenster überschreibt', async () => {
    const client = makeClient();
    client.setQueryData(TODAY_KEY, TODAY_DTO);
    const mockPost = okPost();
    mockApi('in_progress', mockPost);

    const { result } = renderHook(() => useCaseFlow(CASE_ID), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.progress).toBeDefined());

    act(() => {
      result.current.setSkuQuantity('sku-1', 2, 1);
    });
    // Ein dazwischen landender Refetch (onSettled-Invalidierung, SSE-Echo) ersetzt
    // den Cache mit dem Server-Stand OHNE die Eingabe …
    act(() => {
      client.setQueryData(AGGREGATE_KEY, aggregateDto('in_progress'));
    });
    expect(cachedSkuLine(client)?.confirmedQuantity).toBeUndefined();

    // … der Flush sendet trotzdem die getippte 2: den beim Tippen festgehaltenen
    // Patch, nicht den neu gelesenen Cache.
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        COUNT_PATH,
        expect.objectContaining({ body: { confirmedQuantity: 2 } }),
      ),
    );
  });

  it('löscht beim Mengen-Flush NICHT die Preiskorrektur eines anderen Beteiligten', async () => {
    const client = makeClient();
    client.setQueryData(TODAY_KEY, TODAY_DTO);
    const mockPost = okPost();
    // Die Zeile trägt bereits die persistierte Preiskorrektur eines ANDEREN.
    const dto = aggregateDto('in_progress');
    dto.positions[0]!.skuLines[0]!.correctedVkPrice = 19.99;
    mockApiWith(dto, mockPost);

    const { result } = renderHook(() => useCaseFlow(CASE_ID), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.progress).toBeDefined());

    act(() => {
      result.current.setSkuQuantity('sku-1', 2, 1);
    });

    // Exakt EIN Feld im Body: `correctedVkPrice` fehlt (unangetastet) — `null`
    // hieße „Korrektur zurücknehmen" und würde die fremde Korrektur löschen.
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        COUNT_PATH,
        expect.objectContaining({ body: { confirmedQuantity: 2 } }),
      ),
    );
  });
});

describe('useCaseFlow — Abschluss flusht offene Timer und sendet nur eigene Zeilen', () => {
  it('complete() sendet eine noch entprellte Rücksetzung VOR dem Abschluss-POST', async () => {
    const client = makeClient();
    client.setQueryData(TODAY_KEY, TODAY_DTO);
    const mockPost = okPost();
    // Persistierte Mehrmenge (Ist 2, Soll 1) — der MA korrigiert gleich auf Soll.
    const dto = aggregateDto('in_progress');
    dto.positions[0]!.skuLines[0]!.confirmedQuantity = 2;
    mockApiWith(dto, mockPost);

    const { result } = renderHook(() => useCaseFlow(CASE_ID), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.progress).toBeDefined());

    // Rücksetzung auf Soll (confirmedQuantity: null) hängt im 400-ms-Timer …
    act(() => {
      result.current.setSkuQuantity('sku-1', 1, 1);
    });
    expect(mockPost).not.toHaveBeenCalled();

    // … „Beleg erledigt" direkt danach: erst der Zähl-Flush, dann der Abschluss —
    // sonst lehnte der Server mit einer Abweichung ab, die der Schirm nicht zeigt.
    await act(async () => {
      await result.current.complete();
    });

    expect(postedPaths(mockPost)).toEqual([COUNT_PATH, '/api/cases/{caseId}/complete']);
    expect(mockPost).toHaveBeenCalledWith(
      COUNT_PATH,
      expect.objectContaining({ body: { confirmedQuantity: null } }),
    );
    expect(mockPost).toHaveBeenCalledWith(
      '/api/cases/{caseId}/complete',
      expect.objectContaining({ body: { skuQuantities: [] } }),
    );
  });

  it('Teilabschluss sendet NUR selbst berührte Zeilen — fremde Zählungen bleiben draußen', async () => {
    const client = makeClient();
    client.setQueryData(TODAY_KEY, TODAY_DTO);
    const mockPost = okPost();
    // Zweite Größenzeile mit der Zählung eines ANDEREN Beteiligten (Ist 3, Soll 5).
    const dto = aggregateDto('in_progress');
    dto.positions[0]!.skuLines.push({
      id: 'sku-2',
      ean: '4000000000002',
      size: '10',
      expectedQuantity: 5,
      confirmedQuantity: 3,
      status: 'deviation',
    } as SkuLineDto);
    mockApiWith(dto, mockPost);

    const { result } = renderHook(() => useCaseFlow(CASE_ID), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.progress).toBeDefined());

    // Ich fasse nur sku-1 an; sku-2 gehört dem anderen.
    act(() => {
      result.current.setSkuQuantity('sku-1', 2, 1);
    });
    await act(async () => {
      await result.current.partialComplete();
    });

    // sku-2 fehlt im Body: der Server behält den persistierten Stand des anderen,
    // statt ihn mit meinem (ggf. veralteten) Cache-Wert zu überschreiben.
    expect(mockPost).toHaveBeenCalledWith(
      '/api/cases/{caseId}/partial-complete',
      expect.objectContaining({
        body: {
          skuQuantities: [{ skuLineId: 'sku-1', confirmedQuantity: 2 }],
          problems: [],
        },
      }),
    );
  });
});

describe('useCaseFlow — „Teilbeleg erledigt"', () => {
  it('meldet die eigene Beteiligung per POST part-done', async () => {
    const client = makeClient();
    client.setQueryData(TODAY_KEY, TODAY_DTO);
    const mockPost = okPost();
    mockApi('in_progress', mockPost);

    const { result } = renderHook(() => useCaseFlow(CASE_ID), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.progress).toBeDefined());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.partDone();
    });

    expect(ok).toBe(true);
    expect(mockPost).toHaveBeenCalledWith(
      PART_DONE_PATH,
      expect.objectContaining({ params: { path: { caseId: CASE_ID } } }),
    );
  });

  it('meldet partDonePending, solange der POST läuft (Doppeltipp-Schutz)', async () => {
    const client = makeClient();
    client.setQueryData(TODAY_KEY, TODAY_DTO);
    const { post: mockPost, release } = deferredPost(PART_DONE_PATH);
    mockApi('in_progress', mockPost);

    const { result } = renderHook(() => useCaseFlow(CASE_ID), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.progress).toBeDefined());
    expect(result.current.partDonePending).toBe(false);

    let done!: Promise<boolean>;
    act(() => {
      done = result.current.partDone();
    });
    // Der Bildschirm sperrt den Knopf über genau dieses Flag.
    await waitFor(() => expect(result.current.partDonePending).toBe(true));
    await act(async () => {
      release();
      await done;
    });
    expect(result.current.partDonePending).toBe(false);
  });

  it('zeigt den Fehlertext des Backends, wenn die Meldung abgelehnt wird', async () => {
    const client = makeClient();
    client.setQueryData(TODAY_KEY, TODAY_DTO);
    const mockPost = vi.fn().mockResolvedValue({
      data: undefined,
      error: { message: 'Dein Teil ist bereits erledigt.' },
      response: { status: 409 },
    });
    mockApi('in_progress', mockPost);

    const { result } = renderHook(() => useCaseFlow(CASE_ID), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.progress).toBeDefined());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.partDone();
    });

    expect(ok).toBe(false);
    await waitFor(() => expect(result.current.actionError).toBe('Dein Teil ist bereits erledigt.'));
  });
});

/**
 * Railway-Bug: ein FERTIGER Beleg (completed) wird erneut geöffnet — die erste
 * lokale Aktion stieß vorher `start-preparation` an und das Backend lehnte mit
 * „Illegal case transition: completed → in_progress" (400) ab. Fertige Belege
 * sind reine Ansicht: kein Start-Übergang, keine Mutation, kein POST.
 */
describe('useCaseFlow — fertiger Beleg wird geöffnet (read-only)', () => {
  function setup(status: string) {
    const client = makeClient();
    client.setQueryData(TODAY_KEY, todayDto(status));
    const mockPost = okPost();
    mockApi(status, mockPost);
    return { client, mockPost };
  }

  it('completed: readOnly, keine Aktion löst einen POST aus, Mutationen sind no-ops', async () => {
    const { client, mockPost } = setup('completed');
    const { result } = renderHook(() => useCaseFlow(CASE_ID), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(result.current.progress).toBeDefined());

    expect(result.current.readOnly).toBe(true);

    await act(async () => {
      await result.current.togglePositionChecked('pos-1');
    });
    expect(cachedPosition(client)?.confirmedBy).toBeUndefined();

    act(() => {
      result.current.setSkuQuantity('sku-1', 3, 1);
    });
    expect(cachedSkuLine(client)?.confirmedQuantity).toBeUndefined();

    // „Beleg erledigt"/Teilabschluss/Teilbeleg sind defensiv abgesichert.
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.complete();
    });
    expect(ok).toBe(false);
    await act(async () => {
      ok = await result.current.partDone();
    });
    expect(ok).toBe(false);

    expect(mockPost).not.toHaveBeenCalled();
    expect(result.current.actionError).toBeUndefined();
  });

  it('zst_done: ebenfalls readOnly ohne jeden POST', async () => {
    const { client, mockPost } = setup('zst_done');
    const { result } = renderHook(() => useCaseFlow(CASE_ID), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(result.current.progress).toBeDefined());

    expect(result.current.readOnly).toBe(true);
    await act(async () => {
      await result.current.togglePositionChecked('pos-1');
    });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('in_progress (z. B. nach Reload): bearbeitbar, aber KEIN erneuter Start-Übergang', async () => {
    const { client, mockPost } = setup('in_progress');
    const { result } = renderHook(() => useCaseFlow(CASE_ID), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(result.current.progress).toBeDefined());

    expect(result.current.readOnly).toBe(false);

    await act(async () => {
      await result.current.togglePositionChecked('pos-1');
    });
    // Nur der Haken selbst — in_progress → in_progress wäre eine illegale Kante.
    expect(postedPaths(mockPost)).toEqual([CONFIRM_PATH]);
  });
});
