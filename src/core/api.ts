// Typed mycelium client: one GrpcWebClient plus the auth metadata that
// pileus-player's AuthInterceptor attaches to every call.

import * as auth from '../gen/auth';
import * as media from '../gen/media';
import {CallOptions, GrpcError, GrpcStatus, GrpcWebClient} from './grpcWeb';

export interface ServerInfo {
  name: string;
  version: string;
  http_port: number;
  grpc_port: number;
  setup_done: boolean;
}

class Credentials {
  jwt = '';
  profileId = '';
  profileSession = '';
  httpHost = '';
  httpScheme = 'http';

  metadata(): Record<string, string> {
    const m: Record<string, string> = {};
    // Tell mycelium which base to build image-proxy URLs against.
    if (this.httpHost) {
      m['x-http-host'] = this.httpHost;
      m['x-http-scheme'] = this.httpScheme;
    }
    if (this.jwt) {
      m.authorization = `Bearer ${this.jwt}`;
      if (this.profileId) {
        m['x-profile-id'] = this.profileId;
        if (this.profileSession) {
          m['x-profile-session'] = this.profileSession;
        }
      }
    }
    return m;
  }
}

const A = '/mycelium.AuthService/';
const M = '/mycelium.MediaPipeline/';
const P = '/mycelium.PluginService/';

export class Mycelium {
  readonly creds = new Credentials();
  private readonly rpc = new GrpcWebClient('', () => this.creds.metadata());

  setOrigin(origin: string) {
    this.rpc.setOrigin(origin);
    const m = /^(https?):\/\/([^/]+)/.exec(origin);
    this.creds.httpScheme = m?.[1] ?? 'http';
    this.creds.httpHost = m?.[2] ?? '';
  }

  get origin() {
    return this.rpc.getOrigin();
  }

  setProfile(profileId: string) {
    if (profileId !== this.creds.profileId) {
      this.creds.profileSession = '';
    }
    this.creds.profileId = profileId;
  }

  /** GET /pileus/info; throws unless the origin really is a Mycelium. */
  async probe(timeoutMs = 6000): Promise<ServerInfo> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(`${this.origin}/pileus/info`, {signal: ctl.signal});
      if (!r.ok) {
        throw new GrpcError(GrpcStatus.UNAVAILABLE, `HTTP ${r.status}`);
      }
      const info = (await r.json()) as ServerInfo;
      if (info?.name !== 'Mycelium') {
        throw new GrpcError(
          GrpcStatus.FAILED_PRECONDITION,
          'Il server risponde ma non è un Mycelium',
        );
      }
      return info;
    } catch (e) {
      if (e instanceof GrpcError) {
        throw e;
      }
      throw new GrpcError(GrpcStatus.UNAVAILABLE, 'Server non raggiungibile');
    } finally {
      clearTimeout(t);
    }
  }

  // ── AuthService ──────────────────────────────────────────────────────────

  authorizeDevice(deviceId: string, pairingCode: string) {
    // pin_hash carries the raw pairing code — the server compares it as-is.
    return this.rpc.unary(
      A + 'AuthorizeDevice',
      auth.AuthorizeDeviceRequest,
      auth.AuthorizeDeviceResponse,
      {deviceId, pinHash: pairingCode},
    );
  }

  refreshToken() {
    return this.rpc.unary(
      A + 'RefreshToken',
      auth.RefreshTokenRequest,
      auth.AuthorizeDeviceResponse,
      {},
    );
  }

  unpairSelf() {
    return this.rpc.unary(
      A + 'UnpairSelf',
      auth.UnpairSelfRequest,
      auth.UnpairSelfResponse,
      {},
      {timeoutMs: 5000},
    );
  }

  async listProfiles() {
    const r = await this.rpc.unary(
      A + 'ListProfiles',
      auth.ListProfilesRequest,
      auth.ListProfilesResponse,
      {},
    );
    return r.profiles;
  }

  createProfile(name: string, avatarUrl = '') {
    return this.rpc.unary(
      A + 'CreateProfile',
      auth.CreateProfileRequest,
      auth.ProfileResponse,
      {name, avatarUrl},
    );
  }

  updateProfile(profileId: string, name: string, avatarUrl: string) {
    return this.rpc.unary(A + 'UpdateProfile', auth.UpdateProfileRequest, auth.ProfileResponse, {
      profileId,
      name,
      avatarUrl,
    });
  }

  deleteProfile(profileId: string) {
    return this.rpc.unary(A + 'DeleteProfile', auth.DeleteProfileRequest, auth.DeleteProfileResponse, {profileId});
  }

  /** Writes the whole preferences blob (pileus-player's ProfilePrefs JSON). */
  setProfilePreferences(profileId: string, preferencesJson: string) {
    return this.rpc.unary(A + 'SetProfilePreferences', auth.SetProfilePreferencesRequest, auth.ProfileResponse, {
      profileId,
      preferencesJson,
    });
  }

  /** newPin '' removes the PIN. */
  setProfilePin(profileId: string, currentPin: string, newPin: string) {
    return this.rpc.unary(A + 'SetProfilePin', auth.SetProfilePinRequest, auth.SetProfilePinResponse, {
      profileId,
      currentPin,
      newPin,
    });
  }

  /** forgetDevice drops "Ricorda dispositivo": the PIN is asked again here. */
  lockProfile(profileId: string, forgetDevice: boolean) {
    return this.rpc.unary(A + 'LockProfile', auth.LockProfileRequest, auth.LockProfileResponse, {
      profileId,
      forgetDevice,
    });
  }

  getDownloadOptions(pluginId: string, streamId: string) {
    return this.rpc.unary(M + 'GetDownloadOptions', media.DownloadOptionsRequest, media.DownloadOptionsResponse, {
      pluginId,
      streamId,
    });
  }

  createDownload(req: Partial<media.CreateDownloadRequest>) {
    return this.rpc.unary(M + 'CreateDownload', media.CreateDownloadRequest, media.DownloadInfo, req);
  }

  /** Several episodes with the same quality/track choices (season, next N). */
  createDownloads(req: Partial<media.CreateDownloadsRequest>) {
    return this.rpc.unary(M + 'CreateDownloads', media.CreateDownloadsRequest, media.CreateDownloadsResponse, req);
  }

  listDownloads() {
    return this.rpc.unary(M + 'ListDownloads', media.ListDownloadsRequest, media.ListDownloadsResponse, {});
  }

  cancelDownload(downloadId: string) {
    return this.rpc.unary(M + 'CancelDownload', media.DownloadIdRequest, media.DownloadActionResponse, {downloadId});
  }

  deleteDownload(downloadId: string) {
    return this.rpc.unary(M + 'DeleteDownload', media.DownloadIdRequest, media.DownloadActionResponse, {downloadId});
  }

  async getPluginSettings(pluginId: string) {
    const r = await this.rpc.unary(
      P + 'GetPluginSettings',
      media.GetPluginSettingsRequest,
      media.GetPluginSettingsResponse,
      {pluginId},
    );
    return r.fields;
  }

  triggerRefresh(pluginId: string) {
    return this.rpc.unary(P + 'TriggerRefresh', media.TriggerRefreshRequest, media.TriggerRefreshResponse, {pluginId});
  }

  /** value '' clears the setting. */
  savePluginSetting(pluginId: string, key: string, value: string) {
    return this.rpc.unary(P + 'SavePluginSetting', media.SavePluginSettingRequest, media.SavePluginSettingResponse, {
      pluginId,
      key,
      value,
    });
  }

  async unlockProfile(profileId: string, pin: string, rememberDevice: boolean) {
    const r = await this.rpc.unary(
      A + 'UnlockProfile',
      auth.UnlockProfileRequest,
      auth.UnlockProfileResponse,
      {profileId, pin, rememberDevice},
    );
    if (r.sessionToken && profileId === this.creds.profileId) {
      this.creds.profileSession = r.sessionToken;
    }
    return r;
  }

  // ── MediaPipeline ────────────────────────────────────────────────────────

  async listPlugins() {
    const r = await this.rpc.unary(
      M + 'ListPlugins',
      media.PluginListRequest,
      media.PluginListResponse,
      {},
    );
    return r.plugins;
  }

  getCatalog(pluginId: string, catalogId: string, page = 1) {
    return this.rpc.unary(
      M + 'GetCatalog',
      media.CatalogRequest,
      media.CatalogResponse,
      {pluginId, catalogId, page},
    );
  }

  async getContinueWatching(limit = 0) {
    const r = await this.rpc.unary(
      M + 'GetContinueWatching',
      media.ContinueWatchingRequest,
      media.ContinueWatchingResponse,
      {limit},
    );
    return r.items;
  }

  async getSearchFilters(pluginId: string) {
    const r = await this.rpc.unary(
      M + 'GetSearchFilters',
      media.SearchFiltersRequest,
      media.SearchFiltersResponse,
      {pluginId},
    );
    return r.filters;
  }

  search(
    pluginId: string,
    query: string,
    page = 1,
    filters: Record<string, string> = {},
  ) {
    return this.rpc.unary(
      M + 'Search',
      media.SearchRequest,
      media.SearchResponse,
      {pluginId, query, page, filters},
    );
  }

  getDetails(pluginId: string, mediaId: string) {
    return this.rpc.unary(
      M + 'GetDetails',
      media.DetailsRequest,
      media.DetailsResponse,
      {pluginId, mediaId},
    );
  }

  browse(pluginId: string, parentId: string, childId = '', page = 1) {
    return this.rpc.unary(
      M + 'Browse',
      media.BrowseRequest,
      media.BrowseResponse,
      {pluginId, parentId, childId, page},
    );
  }

  async getStreams(pluginId: string, mediaId: string) {
    const r = await this.rpc.unary(
      M + 'GetStreams',
      media.StreamsRequest,
      media.StreamsResponse,
      {pluginId, mediaId},
    );
    return r.sources;
  }

  /** ResolveStream, waiting for the final result event. */
  async resolveStream(
    req: Partial<media.ResolveRequest>,
    opts: CallOptions = {},
  ): Promise<media.ResolveResponse> {
    const events = await this.rpc.serverStream(
      M + 'ResolveStream',
      media.ResolveRequest,
      media.ResolveStreamEvent,
      req,
      {timeoutMs: 90000, ...opts},
    );
    const result = events.find(e => e.result)?.result;
    if (!result) {
      const last = events.filter(e => e.progress).pop()?.progress;
      throw new GrpcError(
        GrpcStatus.UNKNOWN,
        last?.message || 'Nessuno stream risolto',
      );
    }
    return result;
  }

  updateProgress(req: Partial<media.ProgressRequest>) {
    return this.rpc.unary(
      M + 'UpdateProgress',
      media.ProgressRequest,
      media.ProgressResponse,
      req,
      {timeoutMs: 8000},
    );
  }

  deleteProgress(pluginId: string, mediaId: string) {
    return this.rpc.unary(
      M + 'DeleteProgress',
      media.DeleteProgressRequest,
      media.DeleteProgressResponse,
      {pluginId, mediaId},
      {timeoutMs: 8000},
    );
  }

  /** Prepare a stream ahead of Play (best-effort, returns at once). */
  warmStream(pluginId: string, streamId: string) {
    return this.rpc.unary(
      M + 'WarmStream',
      media.WarmStreamRequest,
      media.WarmStreamResponse,
      {pluginId, streamId},
      {timeoutMs: 5000},
    );
  }

  releasePlayback() {
    return this.rpc.unary(
      M + 'ReleasePlayback',
      media.ReleasePlaybackRequest,
      media.ReleasePlaybackResponse,
      {},
      {timeoutMs: 5000},
    );
  }
}

export const mycelium = new Mycelium();
