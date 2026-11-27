import React from 'react'
import { api, sourceLabel } from '../api'
import { Empty, Loading, useToast } from '../components/ui'

type Tab = 'games' | 'licenses' | 'sellers' | 'assets'

export default function Catalog() {
  const [tab, setTab] = React.useState<Tab>('games')
  const [games, setGames] = React.useState<any[] | null>(null)
  const [licenses, setLicenses] = React.useState<any[] | null>(null)
  const [sellers, setSellers] = React.useState<any[] | null>(null)
  const [assets, setAssets] = React.useState<any[] | null>(null)
  const [gameForm, setGameForm] = React.useState({ name: '', aliases: '', publisher: '', ipOwner: '' })
  const [licForm, setLicForm] = React.useState({ gameId: '', holder: '', licenseType: '普通', certNo: '', validTo: '' })
  const [assetForm, setAssetForm] = React.useState<{ name: string; gameId: string; dataUrl: string; fileName: string }>({
    name: '', gameId: '', dataUrl: '', fileName: '',
  })
  const [uploading, setUploading] = React.useState(false)
  const { show, node } = useToast()

  const load = React.useCallback(() => {
    api.games().then((r) => setGames(r.items)).catch((e) => show(e.message, true))
    api.licenses().then((r) => setLicenses(r.items)).catch(() => {})
    api.sellers().then((r) => setSellers(r.items)).catch(() => {})
    api.assets().then((r) => setAssets(r.items)).catch(() => {})
  }, [show])

  React.useEffect(() => { load() }, [load])

  const pickImage = (file?: File | null) => {
    if (!file) return
    if (!/^image\/(png|jpeg|jpg)$/.test(file.type)) {
      show('请选择 PNG 或 JPEG 图片', true)
      return
    }
    if (file.size > 4 * 1024 * 1024) {
      show('图片不能超过 4 MB', true)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setAssetForm((f) => ({
        ...f,
        dataUrl: String(reader.result),
        fileName: file.name,
        name: f.name || file.name.replace(/\.[^.]+$/, ''),
      }))
    }
    reader.readAsDataURL(file)
  }

  const uploadAsset = async () => {
    try {
      if (!assetForm.dataUrl) throw new Error('请先选择图片')
      if (!assetForm.name.trim()) throw new Error('请填写素材名称')
      setUploading(true)
      const a = await api.uploadAsset({
        name: assetForm.name.trim(),
        gameId: assetForm.gameId || null,
        dataUrl: assetForm.dataUrl,
      })
      setAssetForm({ name: '', gameId: '', dataUrl: '', fileName: '' })
      load()
      show(`素材已入库，指纹 ${a.phash}`)
    } catch (e: any) {
      show(e.message, true)
    } finally {
      setUploading(false)
    }
  }

  const removeAsset = async (id: string) => {
    try {
      await api.deleteAsset(id)
      load()
      show('素材已删除')
    } catch (e: any) { show(e.message, true) }
  }

  const addGame = async () => {
    try {
      if (!gameForm.name.trim()) throw new Error('请填写作品名称')
      await api.createGame({
        ...gameForm,
        aliases: gameForm.aliases.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean),
      })
      setGameForm({ name: '', aliases: '', publisher: '', ipOwner: '' })
      load()
      show('作品已加入版权库')
    } catch (e: any) { show(e.message, true) }
  }

  const addLicense = async () => {
    try {
      if (!licForm.gameId || !licForm.holder.trim()) throw new Error('请选择作品并填写被授权方')
      await api.createLicense({ ...licForm })
      setLicForm({ gameId: '', holder: '', licenseType: '普通', certNo: '', validTo: '' })
      load()
      show('授权已登记，相关线索风险已重算')
    } catch (e: any) { show(e.message, true) }
  }

  const toggleSeller = async (s: any) => {
    try {
      await api.updateSeller(s.id, { authorized: !s.authorized })
      load()
      show(`已${s.authorized ? '移出' : '加入'}授权名单`)
    } catch (e: any) { show(e.message, true) }
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="tabs">
          <div className={`tab ${tab === 'games' ? 'active' : ''}`} onClick={() => setTab('games')}>作品版权库</div>
          <div className={`tab ${tab === 'licenses' ? 'active' : ''}`} onClick={() => setTab('licenses')}>授权台账</div>
          <div className={`tab ${tab === 'sellers' ? 'active' : ''}`} onClick={() => setTab('sellers')}>卖家白名单</div>
          <div className={`tab ${tab === 'assets' ? 'active' : ''}`} onClick={() => setTab('assets')}>素材库（图片指纹）</div>
        </div>
      </div>

      {tab === 'games' && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-head"><h2>新增监测作品</h2><span className="sub">作品入库后，匹配与评分立即生效</span></div>
            <div className="card-body">
              <div className="form-grid">
                <div className="field"><label>作品名称</label><input value={gameForm.name} onChange={(e) => setGameForm({ ...gameForm, name: e.target.value })} /></div>
                <div className="field"><label>别名 / 俗称（逗号分隔）</label><input value={gameForm.aliases} onChange={(e) => setGameForm({ ...gameForm, aliases: e.target.value })} /></div>
                <div className="field"><label>发行 / 运营方</label><input value={gameForm.publisher} onChange={(e) => setGameForm({ ...gameForm, publisher: e.target.value })} /></div>
                <div className="field"><label>版权方</label><input value={gameForm.ipOwner} onChange={(e) => setGameForm({ ...gameForm, ipOwner: e.target.value })} /></div>
              </div>
              <button className="btn primary" style={{ marginTop: 12 }} onClick={addGame}>加入版权库</button>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h2>在监测作品</h2><span className="sub">{games ? `共 ${games.length} 部` : ''}</span></div>
            {!games ? <Loading /> : (
              <table className="table">
                <thead>
                  <tr>
                    <th>作品</th><th>别名</th><th>发行方</th><th>版权方</th>
                    <th style={{ width: 80 }}>热度</th><th style={{ width: 84 }}>授权</th>
                    <th style={{ width: 84 }}>线索</th><th style={{ width: 90 }}>高风险</th>
                  </tr>
                </thead>
                <tbody>
                  {games.map((g) => (
                    <tr key={g.id}>
                      <td><div className="cell-title">{g.name}</div><div className="cell-sub">{g.region} · {g.category}</div></td>
                      <td>{g.aliases.length ? g.aliases.join(' / ') : <span style={{ color: 'var(--ink-3)' }}>—</span>}</td>
                      <td>{g.publisher || '—'}</td>
                      <td>{g.ip_owner || '—'}</td>
                      <td className="mono">{g.hot}</td>
                      <td className="mono">{g.licenseCount}</td>
                      <td className="mono">{g.listingCount}</td>
                      <td className="mono" style={{ color: g.highCount ? 'var(--danger)' : 'var(--ink-3)' }}>{g.highCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'licenses' && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-head"><h2>登记授权</h2><span className="sub">登记后该主体在渠道内视为已授权，不再命中 R001</span></div>
            <div className="card-body">
              <div className="form-grid">
                <div className="field">
                  <label>作品</label>
                  <select value={licForm.gameId} onChange={(e) => setLicForm({ ...licForm, gameId: e.target.value })}>
                    <option value="">请选择</option>
                    {(games ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div className="field"><label>被授权方（店铺名）</label><input value={licForm.holder} onChange={(e) => setLicForm({ ...licForm, holder: e.target.value })} /></div>
                <div className="field">
                  <label>授权类型</label>
                  <select value={licForm.licenseType} onChange={(e) => setLicForm({ ...licForm, licenseType: e.target.value })}>
                    <option>独家</option><option>普通</option><option>平台直营</option>
                  </select>
                </div>
                <div className="field"><label>授权书编号</label><input value={licForm.certNo} onChange={(e) => setLicForm({ ...licForm, certNo: e.target.value })} /></div>
                <div className="field"><label>有效期至</label><input type="date" value={licForm.validTo} onChange={(e) => setLicForm({ ...licForm, validTo: e.target.value })} /></div>
              </div>
              <button className="btn primary" style={{ marginTop: 12 }} onClick={addLicense}>登记授权</button>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h2>授权台账</h2><span className="sub">{licenses ? `共 ${licenses.length} 条` : ''}</span></div>
            {!licenses ? <Loading /> : licenses.length === 0 ? <Empty /> : (
              <table className="table">
                <thead>
                  <tr>
                    <th>作品</th><th>被授权方</th><th style={{ width: 96 }}>类型</th>
                    <th style={{ width: 140 }}>证书编号</th><th style={{ width: 110 }}>状态</th><th>授权范围</th>
                  </tr>
                </thead>
                <tbody>
                  {licenses.map((l) => (
                    <tr key={l.id}>
                      <td>{l.gameName}</td>
                      <td>{l.holder}</td>
                      <td><span className="badge blue">{l.license_type}</span></td>
                      <td className="mono">{l.cert_no || '—'}</td>
                      <td><span className={`badge ${l.status === '有效' ? 'low' : 'gray'}`}>{l.status}</span></td>
                      <td style={{ color: 'var(--ink-2)' }}>{l.scope || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'sellers' && (
        <div className="card">
          <div className="card-head">
            <h2>卖家白名单</h2>
            <span className="sub">白名单主体视为已授权；开关会触发全量线索重算</span>
          </div>
          {!sellers ? <Loading /> : (
            <table className="table">
              <thead>
                <tr>
                  <th>卖家主体</th><th style={{ width: 120 }}>渠道</th><th style={{ width: 100 }}>线索数</th>
                  <th style={{ width: 120 }}>授权状态</th><th>备注</th><th style={{ width: 120 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {sellers.map((s) => (
                  <tr key={s.id}>
                    <td><div className="cell-title">{s.seller_name}</div><div className="cell-sub">{s.seller_ref}</div></td>
                    <td>{sourceLabel(s.source)}</td>
                    <td className="mono">{s.listingCount}</td>
                    <td><span className={`badge ${s.authorized ? 'low' : 'gray'}`}>{s.authorized ? '已授权' : '未授权'}</span></td>
                    <td style={{ color: 'var(--ink-2)' }}>{s.risk_note || '—'}</td>
                    <td><button className="btn sm" onClick={() => toggleSeller(s)}>{s.authorized ? '移出白名单' : '加入白名单'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {tab === 'assets' && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-head">
              <h2>上传官方素材</h2>
              <span className="sub">只保存感知哈希，不保存原图；用于识别商品主图盗用</span>
            </div>
            <div className="card-body">
              <div className="form-grid">
                <div className="field">
                  <label>素材名称</label>
                  <input value={assetForm.name} placeholder="如：王者荣耀 · 2026 春季主视觉"
                    onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })} />
                </div>
                <div className="field">
                  <label>关联作品</label>
                  <select value={assetForm.gameId} onChange={(e) => setAssetForm({ ...assetForm, gameId: e.target.value })}>
                    <option value="">不指定</option>
                    {(games ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div className="field span-2">
                  <label>图片（PNG / JPEG，≤4 MB）</label>
                  <input type="file" accept="image/png,image/jpeg" onChange={(e) => pickImage(e.target.files?.[0])} />
                  {assetForm.fileName && (
                    <div className="cell-sub">已选择：{assetForm.fileName}</div>
                  )}
                </div>
              </div>
              {assetForm.dataUrl && (
                <div style={{ marginTop: 12 }}>
                  <img src={assetForm.dataUrl} alt="预览" style={{ maxHeight: 120, borderRadius: 8, border: '1px solid var(--line)' }} />
                </div>
              )}
              <button className="btn primary" style={{ marginTop: 12 }} disabled={uploading} onClick={uploadAsset}>
                {uploading ? '计算指纹中…' : '上传并生成指纹'}
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>素材指纹库</h2>
              <span className="sub">{assets ? `共 ${assets.length} 张` : ''}</span>
            </div>
            {!assets ? <Loading /> : assets.length === 0 ? <Empty text="还没有素材，先上传一张官方图" /> : (
              <table className="table">
                <thead>
                  <tr>
                    <th>素材</th>
                    <th style={{ width: 130 }}>作品</th>
                    <th style={{ width: 180 }}>感知哈希</th>
                    <th style={{ width: 90 }}>尺寸</th>
                    <th style={{ width: 100 }}>命中线索</th>
                    <th style={{ width: 120 }}>上传时间</th>
                    <th style={{ width: 70 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <div className="cell-title">{a.name}</div>
                        <div className="cell-sub">{a.note || '—'}</div>
                      </td>
                      <td>{a.gameName ?? <span style={{ color: 'var(--ink-3)' }}>未指定</span>}</td>
                      <td className="mono" style={{ fontSize: 11.5 }}>{a.phash}</td>
                      <td className="mono">{a.width}×{a.height}</td>
                      <td>
                        <span className={`badge ${a.hitCount ? 'high' : 'gray'}`}>{a.hitCount}</span>
                      </td>
                      <td style={{ color: 'var(--ink-3)' }}>{a.created_at?.slice(0, 10)}</td>
                      <td><button className="btn sm ghost" onClick={() => removeAsset(a.id)}>删除</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {node}
    </>
  )
}