/* ===== engine.js ===== */
/* ============================================================================
 * Network Ops Academy — CLI Engine (engine.js)
 * A pragmatic Cisco IOS-style simulator. Models per-device state and renders
 * realistic "show" output. Config commands mutate state so faults are fixable.
 * Works in browser (window.NOA) and Node (module.exports) for testing.
 * ==========================================================================*/
(function (root) {
  'use strict';

  // ---- helpers -------------------------------------------------------------
  const ipToInt = (ip) => ip.split('.').reduce((a, o) => (a << 8) + (parseInt(o, 10) & 255), 0) >>> 0;
  const intToIp = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
  const maskToInt = (m) => ipToInt(m);
  const wildToMask = (w) => intToIp(~ipToInt(w) >>> 0);
  function sameSubnet(a, b, mask) {
    if (!a || !b || !mask) return false;
    const m = maskToInt(mask);
    return ((ipToInt(a) & m) >>> 0) === ((ipToInt(b) & m) >>> 0);
  }
  function maskToPrefix(m) {
    let bits = maskToInt(m), c = 0;
    for (let i = 0; i < 32; i++) { if (bits & 0x80000000) c++; bits = (bits << 1) >>> 0; }
    return c;
  }
  function netAddr(ip, mask) { return intToIp((ipToInt(ip) & maskToInt(mask)) >>> 0); }

  // Normalize interface shorthand: gi0/1 -> GigabitEthernet0/1, fa0/2 -> FastEthernet0/2
  function normIface(s) {
    if (!s) return s;
    const m = s.match(/^([a-z\-]+)\s*([\d/.]+)$/i);
    if (!m) return s;
    let [, type, num] = m;
    type = type.toLowerCase();
    const map = {
      g: 'GigabitEthernet', gi: 'GigabitEthernet', gig: 'GigabitEthernet', gigabitethernet: 'GigabitEthernet',
      f: 'FastEthernet', fa: 'FastEthernet', fas: 'FastEthernet', fastethernet: 'FastEthernet',
      e: 'Ethernet', eth: 'Ethernet', ethernet: 'Ethernet',
      s: 'Serial', se: 'Serial', ser: 'Serial', serial: 'Serial',
      lo: 'Loopback', loopback: 'Loopback',
      vlan: 'Vlan', vl: 'Vlan',
      po: 'Port-channel', portchannel: 'Port-channel', 'port-channel': 'Port-channel',
    };
    return (map[type] || (type.charAt(0).toUpperCase() + type.slice(1))) + num;
  }
  function shortIface(name) {
    return name
      .replace(/^GigabitEthernet/, 'Gig')
      .replace(/^FastEthernet/, 'Fa')
      .replace(/^Ethernet/, 'Eth')
      .replace(/^Serial/, 'Se')
      .replace(/^Loopback/, 'Lo')
      .replace(/^Port-channel/, 'Po')
      .replace(/^Vlan/, 'Vlan');
  }

  // ---- device factory ------------------------------------------------------
  function newIface(name, opts = {}) {
    return Object.assign({
      name,
      type: /Serial/.test(name) ? 'serial' : 'ethernet',
      status: 'down',          // up | down | admin-down
      lineProtocol: 'down',
      adminUp: false,          // becomes true after "no shutdown"
      connected: false,        // physically cabled (set by mission)
      ip: null, mask: null,
      mode: 'access',          // access | trunk | dynamic | routed
      isSwitchport: opts.isSwitchport !== undefined ? opts.isSwitchport : true,
      accessVlan: 1,
      voiceVlan: null,
      nativeVlan: 1,
      trunkAllowed: 'all',
      trunkEncap: 'dot1q',
      description: '',
      speed: name.startsWith('Gig') || name.startsWith('Gigabit') ? '1000' : '100',
      duplex: 'auto',
      portSecurity: null,      // {enabled,max,violation,sticky,macs:[]}
      channelGroup: null,      // {id, mode}
      portfast: false,
      bpduguard: false,
      ipNat: null,             // 'inside' | 'outside'
      helper: null,            // ip helper-address
      ospfArea: null,
      encap: null,             // for subif: {dot1q:N, native:bool}
      parent: null,            // parent iface name for subifs
      ipv6: [],                // list of {addr, prefix} ipv6 addresses
      ipv6Eui: false,          // eui-64
      standby: {},             // hsrp group -> {ip, priority, preempt, version}
      servicePolicy: null,     // {in, out} qos policy names
      cryptoMap: null,         // applied crypto map name
    }, opts);
  }

  function newDevice(cfg) {
    const d = {
      id: cfg.id,
      name: cfg.name || cfg.id,
      type: cfg.type,           // switch | router | l3switch | pc | server
      mode: cfg.type === 'wlc' ? 'wlc' : (cfg.type === 'automation' ? 'auto' : 'user'),  // user | priv | config | if | subif | vlan | router | line | dhcp | acl | wlc | auto
      ctx: {},                  // current config context (iface/vlan/etc)
      interfaces: {},
      vlans: { 1: { id: 1, name: 'default', status: 'active' } },
      ipRouting: cfg.type === 'router' || cfg.type === 'l3switch' ? false : false,
      staticRoutes: [],         // {net,mask,nh,iface,ad}
      connected: [],            // computed connected routes
      ospf: null,               // {pid,routerId,networks:[],passive:[]}
      acls: {},                 // name/number -> {type, rules:[]}
      nat: { rules: [], pat: false, translations: [] },
      dhcp: { pools: {}, excluded: [], bindings: [] },
      macTable: cfg.macTable || [],
      stp: cfg.stp || null,     // {root:vlanId->bool, priority, blocked:[ifaces]}
      cdp: cfg.cdp || [],       // neighbors for show cdp
      banner: null,
      // PC/server
      ip: cfg.ip || null, mask: cfg.mask || null, gateway: cfg.gateway || null, dns: cfg.dns || null,
      meta: cfg.meta || {},
      // ENSA: gestão de rede
      ntp: { servers: [], master: false },
      logging: { hosts: [], buffered: false, console: true, trap: null },
      snmp: { communities: [], location: null, contact: null, host: null },
      // ENSA: QoS
      qos: { classMaps: {}, policyMaps: {} },
      // ENSA: VPN/IPsec
      crypto: { isakmp: [], transformSets: {}, maps: {} },
      // SRWE: IPv6
      ipv6Routing: false,
      ipv6Routes: [],          // {net, prefix, nh}
      // SRWE: Wireless (WLC) / ENSA: Automação
      wlan: cfg.wlan || null,  // for wlc devices
      auto: cfg.auto || null,  // for automation hosts
      // ENSA: hardening / acesso administrativo
      security: { users: [], domainName: null, rsaGenerated: false, sshVersion: null, vty: { transport: null, loginLocal: false } },
    };
    // build interfaces
    (cfg.interfaces || []).forEach((i) => {
      const name = normIface(i.name);
      const isSw = i.isSwitchport !== undefined ? i.isSwitchport
        : (cfg.type === 'switch');
      d.interfaces[name] = newIface(name, Object.assign({ isSwitchport: isSw }, i, { name }));
    });
    // vlans
    (cfg.vlans || []).forEach((v) => { d.vlans[v.id] = { id: v.id, name: v.name || ('VLAN' + v.id), status: 'active' }; });
    if (cfg.ipRouting) d.ipRouting = true;
    if (cfg.ospf) d.ospf = JSON.parse(JSON.stringify(cfg.ospf));
    if (cfg.staticRoutes) d.staticRoutes = JSON.parse(JSON.stringify(cfg.staticRoutes));
    if (cfg.acls) d.acls = JSON.parse(JSON.stringify(cfg.acls));
    if (cfg.nat) d.nat = Object.assign({ rules: [], pat: false, translations: [] }, JSON.parse(JSON.stringify(cfg.nat)));
    if (cfg.dhcp) d.dhcp = Object.assign({ pools: {}, excluded: [], bindings: [] }, JSON.parse(JSON.stringify(cfg.dhcp)));
    recompute(d);
    return d;
  }

  // recompute line protocol / connected routes
  function recompute(d) {
    Object.values(d.interfaces).forEach((i) => {
      if (i.adminUp && i.connected) { i.status = 'up'; i.lineProtocol = 'up'; }
      else if (i.adminUp && !i.connected) { i.status = 'down'; i.lineProtocol = 'down'; }
      else { i.status = 'admin-down'; i.lineProtocol = 'down'; }
    });
    // connected routes for routers/l3
    d.connected = [];
    if (d.type === 'router' || d.type === 'l3switch') {
      Object.values(d.interfaces).forEach((i) => {
        if (i.ip && i.mask && i.status === 'up') {
          d.connected.push({ net: netAddr(i.ip, i.mask), mask: i.mask, iface: i.name, kind: 'C' });
          d.connected.push({ net: i.ip, mask: '255.255.255.255', iface: i.name, kind: 'L' });
        }
      });
    }
  }

  // ---- prompt --------------------------------------------------------------
  function prompt(d) {
    const h = d.name;
    switch (d.mode) {
      case 'user': return h + '>';
      case 'priv': return h + '#';
      case 'config': return h + '(config)#';
      case 'if': return h + '(config-if)#';
      case 'subif': return h + '(config-subif)#';
      case 'vlan': return h + '(config-vlan)#';
      case 'router': return h + '(config-router)#';
      case 'line': return h + '(config-line)#';
      case 'dhcp': return h + '(config-dhcp)#';
      case 'acl': return h + '(config-' + (d.ctx.aclType === 'extended' ? 'ext' : 'std') + '-nacl)#';
      case 'cmap': return h + '(config-cmap)#';
      case 'pmap': return h + '(config-pmap)#';
      case 'pmap-c': return h + '(config-pmap-c)#';
      case 'isakmp': return h + '(config-isakmp)#';
      case 'cryptomap': return h + '(config-crypto-map)#';
      case 'wlc': return h + ' >';
      case 'auto': return d.ctx.cwd ? (d.name + ':' + d.ctx.cwd + '$') : (d.name + '$');
      default: return h + '#';
    }
  }

  // ============================================================================
  // SHOW renderers
  // ============================================================================
  const pad = (s, n) => (s + '').padEnd(n).slice(0, Math.max(n, (s + '').length));
  const rpad = (s, n) => (s + '').padStart(n);

  function showVlanBrief(d) {
    const lines = ['', 'VLAN Name                             Status    Ports',
      '---- -------------------------------- --------- -------------------------------'];
    const vids = Object.keys(d.vlans).map(Number).sort((a, b) => a - b);
    vids.forEach((vid) => {
      const v = d.vlans[vid];
      const ports = Object.values(d.interfaces)
        .filter((i) => i.isSwitchport && i.mode === 'access' && i.accessVlan === vid && !i.channelGroup)
        .map((i) => shortIface(i.name));
      // wrap ports
      const portStr = ports.join(', ');
      lines.push(pad(vid, 5) + pad(v.name, 33) + pad(v.status, 10) + portStr);
    });
    // default reserved vlans
    [1002, 1003, 1004, 1005].forEach((vid, idx) => {
      const names = ['fddi-default', 'token-ring-default', 'fddinet-default', 'trnet-default'];
      const sts = ['act/unsup', 'act/unsup', 'act/unsup', 'act/unsup'];
      lines.push(pad(vid, 5) + pad(names[idx], 33) + pad(sts[idx], 10));
    });
    return lines.join('\n');
  }

  function showInterfacesTrunk(d) {
    const trunks = Object.values(d.interfaces).filter((i) => i.mode === 'trunk' && i.status === 'up');
    if (!trunks.length) return '';
    let out = '\nPort        Mode             Encapsulation  Status        Native vlan\n';
    trunks.forEach((i) => {
      out += pad(shortIface(i.name), 12) + pad('on', 17) + pad('802.1q', 15) + pad('trunking', 14) + i.nativeVlan + '\n';
    });
    out += '\nPort        Vlans allowed on trunk\n';
    trunks.forEach((i) => { out += pad(shortIface(i.name), 12) + (i.trunkAllowed === 'all' ? '1-4094' : i.trunkAllowed) + '\n'; });
    out += '\nPort        Vlans allowed and active in management domain\n';
    trunks.forEach((i) => { out += pad(shortIface(i.name), 12) + activeVlans(d, i) + '\n'; });
    out += '\nPort        Vlans in spanning tree forwarding state and not pruned\n';
    trunks.forEach((i) => { out += pad(shortIface(i.name), 12) + activeVlans(d, i) + '\n'; });
    return out.replace(/\n$/, '');
  }
  function activeVlans(d, i) {
    const all = Object.keys(d.vlans).map(Number).sort((a, b) => a - b);
    if (i.trunkAllowed === 'all') return all.join(',');
    return i.trunkAllowed;
  }

  function showIpIntBrief(d) {
    let out = '\nInterface                  IP-Address      OK? Method Status                Protocol\n';
    const order = Object.values(d.interfaces);
    order.forEach((i) => {
      const ip = i.ip || 'unassigned';
      const ok = i.ip ? 'YES' : 'YES';
      const method = i.ip ? 'manual' : 'unset';
      let st = i.status === 'up' ? 'up' : (i.status === 'admin-down' ? 'administratively down' : 'down');
      out += pad(i.name, 27) + pad(ip, 16) + pad(ok, 4) + pad(method, 7) + pad(st, 22) + i.lineProtocol + '\n';
    });
    return out.replace(/\n$/, '');
  }

  function showInterfacesStatus(d) {
    let out = '\nPort      Name               Status       Vlan       Duplex  Speed Type\n';
    Object.values(d.interfaces).forEach((i) => {
      let st = i.status === 'up' ? 'connected' : (i.status === 'admin-down' ? 'disabled' : 'notconnect');
      let vlan = i.mode === 'trunk' ? 'trunk' : i.accessVlan;
      out += pad(shortIface(i.name), 10) + pad(i.description || '', 19) + pad(st, 13)
        + pad(vlan, 11) + pad('a-full', 8) + pad('a-' + i.speed, 6) + '10/100/1000BaseTX\n';
    });
    return out.replace(/\n$/, '');
  }

  function routeTable(d) {
    // gather: connected + static + ospf(learned, provided by mission via meta.learned)
    let routes = [];
    recompute(d);
    d.connected.forEach((r) => routes.push(Object.assign({ ad: 0 }, r)));
    d.staticRoutes.forEach((r) => routes.push({ kind: r.nh ? 'S' : 'S', net: r.net, mask: r.mask, nh: r.nh, iface: r.iface, ad: r.ad || 1 }));
    (d.meta.learnedRoutes || []).forEach((r) => routes.push(r)); // {kind:'O',net,mask,nh,iface,ad,metric}
    return routes;
  }

  function showIpRoute(d) {
    if (d.type !== 'router' && d.type !== 'l3switch') return d.name + '> : command not available';
    const routes = routeTable(d);
    let out = '\nCodes: L - local, C - connected, S - static, O - OSPF, ' +
      'IA - OSPF inter area\n       * - candidate default\n\n';
    if (!routes.length) { return out + 'Gateway of last resort is not set\n'; }
    // group by major net for realism — simplified: list each
    out += 'Gateway of last resort is ' + (d.meta.gateway || 'not set') + '\n\n';
    const seen = new Set();
    routes.sort((a, b) => ipToInt(a.net) - ipToInt(b.net)).forEach((r) => {
      const key = r.kind + r.net + r.mask;
      if (seen.has(key)) return; seen.add(key);
      const px = '/' + maskToPrefix(r.mask);
      if (r.kind === 'C') out += `C        ${r.net}${px} is directly connected, ${shortIface(r.iface)}\n`;
      else if (r.kind === 'L') out += `L        ${r.net}/32 is directly connected, ${shortIface(r.iface)}\n`;
      else if (r.kind === 'S') out += `S        ${r.net}${px} [1/0] via ${r.nh || ''}${r.iface ? ', ' + shortIface(r.iface) : ''}\n`;
      else if (r.kind === 'O') out += `O        ${r.net}${px} [110/${r.metric || 10}] via ${r.nh}, 00:0${(Math.random() * 5 | 0)}:12, ${shortIface(r.iface)}\n`;
      else if (r.kind === 'O*') out += `O*E2     0.0.0.0/0 [110/1] via ${r.nh}, ${shortIface(r.iface)}\n`;
    });
    return out.replace(/\n$/, '');
  }

  function showOspfNeighbor(d) {
    if (!d.ospf) return '';
    const ns = d.meta.ospfNeighbors || [];
    if (!ns.length) return ''; // no neighbors -> empty
    let out = '\nNeighbor ID     Pri   State           Dead Time   Address         Interface\n';
    ns.forEach((n) => {
      out += pad(n.id, 16) + pad(n.pri || 1, 6) + pad(n.state || 'FULL/DR', 16)
        + pad(n.dead || '00:00:35', 12) + pad(n.address, 16) + shortIface(n.iface) + '\n';
    });
    return out.replace(/\n$/, '');
  }

  function showIpProtocols(d) {
    if (!d.ospf) return '\n*** IP Routing is NSF aware ***\n';
    let out = '\n*** IP Routing is NSF aware ***\n\nRouting Protocol is "ospf ' + d.ospf.pid + '"\n';
    out += '  Router ID ' + (d.ospf.routerId || autoRid(d)) + '\n';
    out += '  Number of areas in this router is ' + areaCount(d) + '\n';
    out += '  Routing for Networks:\n';
    (d.ospf.networks || []).forEach((n) => { out += '    ' + n.net + ' ' + n.wild + ' area ' + n.area + '\n'; });
    if (d.ospf.passive && d.ospf.passive.length) {
      out += '  Passive Interface(s):\n';
      d.ospf.passive.forEach((p) => { out += '    ' + p + '\n'; });
    }
    out += '  Distance: (default is 110)\n';
    return out.replace(/\n$/, '');
  }
  function autoRid(d) {
    // highest loopback else highest active ip
    let best = null;
    Object.values(d.interfaces).forEach((i) => {
      if (i.ip && (!best || ipToInt(i.ip) > ipToInt(best))) best = i.ip;
    });
    return best || '0.0.0.0';
  }
  function areaCount(d) {
    const s = new Set((d.ospf.networks || []).map((n) => n.area));
    return s.size || 1;
  }

  function showRun(d) {
    let out = '\nBuilding configuration...\n\nCurrent configuration : ... bytes\n!\nversion 15.2\n!\nhostname ' + d.name + '\n!\n';
    if (d.ipRouting) out += 'ip routing\n!\n';
    // dhcp
    Object.values(d.dhcp.pools).forEach((p) => {
      out += 'ip dhcp pool ' + p.name + '\n';
      if (p.network) out += ' network ' + p.network + ' ' + p.mask + '\n';
      if (p.defaultRouter) out += ' default-router ' + p.defaultRouter + '\n';
      if (p.dns) out += ' dns-server ' + p.dns + '\n';
      out += '!\n';
    });
    d.dhcp.excluded.forEach((e) => { out += 'ip dhcp excluded-address ' + e.from + (e.to ? ' ' + e.to : '') + '\n'; });
    // vlans
    // interfaces
    Object.values(d.interfaces).forEach((i) => {
      out += 'interface ' + i.name + '\n';
      if (i.description) out += ' description ' + i.description + '\n';
      if (i.encap) out += ' encapsulation dot1Q ' + i.encap.dot1q + (i.encap.native ? ' native' : '') + '\n';
      if (i.isSwitchport) {
        if (i.mode === 'trunk') { out += ' switchport mode trunk\n'; if (i.nativeVlan !== 1) out += ' switchport trunk native vlan ' + i.nativeVlan + '\n'; if (i.trunkAllowed !== 'all') out += ' switchport trunk allowed vlan ' + i.trunkAllowed + '\n'; }
        else if (i.mode === 'access') { out += ' switchport mode access\n'; if (i.accessVlan !== 1) out += ' switchport access vlan ' + i.accessVlan + '\n'; }
        if (i.portSecurity && i.portSecurity.enabled) {
          out += ' switchport port-security\n';
          if (i.portSecurity.max !== 1) out += ' switchport port-security maximum ' + i.portSecurity.max + '\n';
          if (i.portSecurity.violation !== 'shutdown') out += ' switchport port-security violation ' + i.portSecurity.violation + '\n';
          if (i.portSecurity.sticky) out += ' switchport port-security mac-address sticky\n';
        }
      } else {
        if (i.ip) out += ' ip address ' + i.ip + ' ' + i.mask + '\n';
        else out += ' no ip address\n';
        if (i.ipNat) out += ' ip nat ' + i.ipNat + '\n';
        if (i.helper) out += ' ip helper-address ' + i.helper + '\n';
      }
      if (i.channelGroup) out += ' channel-group ' + i.channelGroup.id + ' mode ' + i.channelGroup.mode + '\n';
      if (!i.adminUp) out += ' shutdown\n';
      out += '!\n';
    });
    if (d.ospf) {
      out += 'router ospf ' + d.ospf.pid + '\n';
      if (d.ospf.routerId) out += ' router-id ' + d.ospf.routerId + '\n';
      (d.ospf.networks || []).forEach((n) => { out += ' network ' + n.net + ' ' + n.wild + ' area ' + n.area + '\n'; });
      (d.ospf.passive || []).forEach((p) => { out += ' passive-interface ' + p + '\n'; });
      out += '!\n';
    }
    d.staticRoutes.forEach((r) => { out += 'ip route ' + r.net + ' ' + r.mask + ' ' + (r.nh || r.iface) + '\n'; });
    // nat
    d.nat.rules.forEach((r) => { out += 'ip nat inside source list ' + r.acl + ' interface ' + r.iface + (r.overload ? ' overload' : '') + '\n'; });
    // acls
    Object.keys(d.acls).forEach((name) => {
      const a = d.acls[name];
      if (a.named) {
        out += 'ip access-list ' + a.type + ' ' + name + '\n';
        a.rules.forEach((r) => { out += ' ' + aclRuleStr(r) + '\n'; });
      } else {
        a.rules.forEach((r) => { out += 'access-list ' + name + ' ' + aclRuleStr(r) + '\n'; });
      }
    });
    out += '!\nend\n';
    return out;
  }
  function aclRuleStr(r) {
    let s = r.action;
    if (r.proto) s += ' ' + r.proto;
    s += ' ' + (r.src || 'any');
    if (r.srcWild && r.src !== 'any') s += ' ' + r.srcWild;
    if (r.dst) { s += ' ' + r.dst; if (r.dstWild && r.dst !== 'any') s += ' ' + r.dstWild; }
    if (r.port) s += ' eq ' + r.port;
    return s;
  }

  function showAccessLists(d) {
    const names = Object.keys(d.acls);
    if (!names.length) return '';
    let out = '';
    names.forEach((name) => {
      const a = d.acls[name];
      const label = isNaN(+name)
        ? (a.type === 'extended' ? 'Extended IP access list ' : 'Standard IP access list ') + name
        : ((+name < 100 ? 'Standard' : 'Extended') + ' IP access list ' + name);
      out += label + '\n';
      a.rules.forEach((r, idx) => { out += '    ' + ((idx + 1) * 10) + ' ' + aclRuleStr(r) + '\n'; });
    });
    return out.replace(/\n$/, '');
  }

  function showSpanningTree(d) {
    if (!d.stp) {
      // synth basic
      return '\nVLAN0001\n  Spanning tree enabled protocol rstp\n  Root ID    Priority    32769\n';
    }
    let out = '';
    (d.stp.vlans || [1]).forEach((vid) => {
      const isRoot = (d.stp.rootFor || []).includes(vid);
      out += '\nVLAN' + String(vid).padStart(4, '0') + '\n';
      out += '  Spanning tree enabled protocol ' + (d.stp.proto || 'ieee') + '\n';
      out += '  Root ID    Priority    ' + (isRoot ? (d.stp.priority || 32768) + vid : d.stp.rootPriority || 24577) + '\n';
      out += '             Address     ' + (d.stp.rootMac || '0001.0001.0001') + '\n';
      out += '             ' + (isRoot ? 'This bridge is the root' : 'Cost        19\n             Port        1') + '\n';
      out += '\n  Bridge ID  Priority    ' + ((d.stp.priority || 32768) + vid) + '  (priority ' + (d.stp.priority || 32768) + ' sys-id-ext ' + vid + ')\n';
      out += '             Address     ' + (d.stp.bridgeMac || '00aa.00bb.00cc') + '\n\n';
      out += 'Interface           Role Sts Cost      Prio.Nbr Type\n';
      out += '------------------- ---- --- --------- -------- --------------------------------\n';
      (d.stp.ports || []).filter((p) => !p.vlan || p.vlan === vid).forEach((p) => {
        out += pad(p.iface, 20) + pad(p.role, 5) + pad(p.sts, 4) + pad(p.cost || 19, 10) + pad(p.prio || '128.1', 9) + (p.type || 'P2p') + '\n';
      });
    });
    return out;
  }

  function showEtherchannel(d) {
    const groups = {};
    Object.values(d.interfaces).forEach((i) => {
      if (i.channelGroup) { (groups[i.channelGroup.id] = groups[i.channelGroup.id] || { mode: i.channelGroup.mode, members: [] }).members.push(i); }
    });
    const ids = Object.keys(groups);
    if (!ids.length) return '\nFlags:  D - down        P - bundled in port-channel\n        s - suspended\n\nNumber of channel-groups in use: 0\nNumber of aggregators:           0\n';
    let out = '\nFlags:  D - down        P - bundled in port-channel\n        I - stand-alone s - suspended\n        R - Layer3      S - Layer2\n        U - in use      f - failed to allocate aggregator\n\n';
    out += 'Number of channel-groups in use: ' + ids.length + '\nNumber of aggregators:           ' + ids.length + '\n\n';
    out += 'Group  Port-channel  Protocol    Ports\n';
    out += '------+-------------+-----------+-----------------------------------------------\n';
    ids.forEach((id) => {
      const g = groups[id];
      const proto = g.mode === 'on' ? '-' : (g.mode === 'active' || g.mode === 'passive' ? 'LACP' : 'PAgP');
      // consistency check: all members same mode & compatible
      const modes = g.members.map((m) => m.channelGroup.mode);
      const bundled = consistentLag(modes);
      const ports = g.members.map((m) => shortIface(m.name) + '(' + (bundled && m.status === 'up' ? 'P' : (m.status === 'up' ? 'I' : 'D')) + ')').join(' ');
      out += pad(id, 7) + pad('Po' + id + '(' + (bundled ? 'SU' : 'SD') + ')', 14) + pad(proto, 12) + ports + '\n';
    });
    return out;
  }
  function consistentLag(modes) {
    const set = new Set(modes);
    if (set.size === 1 && (set.has('on'))) return true;
    if (modes.every((m) => m === 'active' || m === 'passive') && !(modes.every((m) => m === 'passive'))) return true;
    if (modes.every((m) => m === 'desirable' || m === 'auto') && !(modes.every((m) => m === 'auto'))) return true;
    return false;
  }

  function showPortSecurity(d, iface) {
    const secured = Object.values(d.interfaces).filter((i) => i.portSecurity && i.portSecurity.enabled);
    if (iface) {
      const i = d.interfaces[normIface(iface)];
      if (!i || !i.portSecurity || !i.portSecurity.enabled) return 'Port Security              : Disabled';
      const ps = i.portSecurity;
      return '\nPort Security              : Enabled\nPort Status                : Secure-' + (ps.violated ? 'shutdown' : 'up') +
        '\nViolation Mode             : ' + (ps.violation || 'shutdown').replace(/^\w/, c => c.toUpperCase()) +
        '\nMaximum MAC Addresses      : ' + (ps.max || 1) +
        '\nTotal MAC Addresses        : ' + (ps.macs ? ps.macs.length : 0) +
        '\nSticky MAC Addresses       : ' + (ps.sticky ? (ps.macs ? ps.macs.length : 0) : 0) +
        '\nLast Source Address:Vlan   : ' + (ps.lastSrc || '0000.0000.0000') + ':' + i.accessVlan +
        '\nSecurity Violation Count   : ' + (ps.violations || 0);
    }
    let out = '\nSecure Port  MaxSecureAddr  CurrentAddr  SecurityViolation  Security Action\n';
    out += '                (Count)       (Count)          (Count)\n';
    out += '---------------------------------------------------------------------------\n';
    secured.forEach((i) => {
      const ps = i.portSecurity;
      out += pad(shortIface(i.name), 13) + pad(ps.max || 1, 15) + pad(ps.macs ? ps.macs.length : 0, 13)
        + pad(ps.violations || 0, 19) + (ps.violation || 'Shutdown') + '\n';
    });
    return out.replace(/\n$/, '');
  }

  function showMacTable(d) {
    let out = '\n          Mac Address Table\n-------------------------------------------\n\nVlan    Mac Address       Type        Ports\n----    -----------       --------    -----\n';
    (d.macTable || []).forEach((m) => {
      out += pad(m.vlan, 8) + pad(m.mac, 18) + pad(m.type || 'DYNAMIC', 12) + shortIface(m.port) + '\n';
    });
    return out.replace(/\n$/, '');
  }

  function showNatTranslations(d) {
    if (!d.nat.translations || !d.nat.translations.length) return '';
    let out = '\nPro  Inside global         Inside local          Outside local         Outside global\n';
    d.nat.translations.forEach((t) => {
      out += pad(t.proto || 'icmp', 5) + pad(t.insideGlobal, 22) + pad(t.insideLocal, 22) + pad(t.outsideLocal || '---', 22) + (t.outsideGlobal || '---') + '\n';
    });
    return out.replace(/\n$/, '');
  }

  function showDhcpBinding(d) {
    if (!d.dhcp.bindings || !d.dhcp.bindings.length) return '';
    let out = '\nIP address          Client-ID/              Lease expiration        Type\n                    Hardware address\n';
    d.dhcp.bindings.forEach((b) => {
      out += pad(b.ip, 20) + pad(b.mac, 24) + pad(b.lease || 'Infinite', 24) + (b.type || 'Automatic') + '\n';
    });
    return out.replace(/\n$/, '');
  }

  // ============================================================================
  // PARSER + EXECUTOR
  // ============================================================================
  function err(msg) { return { out: msg, ok: false }; }
  function ok(msg) { return { out: msg || '', ok: true }; }

  // ---- new SHOW renderers (IPv6 / HSRP / NTP / Syslog / SNMP / QoS / VPN) ----
  function showIpv6IntBrief(d) {
    let out = '\n';
    Object.values(d.interfaces).forEach((i) => {
      if (!i.ipv6 || !i.ipv6.length && !i.ipv6Enabled) return;
      out += pad(shortIface(i.name), 22) + '[' + (i.status === 'up' ? 'up' : (i.status === 'admin-down' ? 'administratively down' : 'down')) + '/' + i.lineProtocol + ']\n';
      i.ipv6.forEach((a) => { out += '    ' + a.addr + (a.eui ? ' (EUI-64)' : '') + '/' + a.prefix + '\n'; });
    });
    return out === '\n' ? '\n(nenhuma interface IPv6 configurada)' : out;
  }
  function showIpv6Route(d) {
    let out = '\nIPv6 Routing Table\nCodes: C - Connected, L - Local, S - Static\n\n';
    let any = false;
    Object.values(d.interfaces).forEach((i) => {
      if (i.ipv6 && i.ipv6.length && i.status === 'up') {
        i.ipv6.forEach((a) => { out += 'C   ' + a.addr + '/' + a.prefix + ' [0/0]\n     via ' + shortIface(i.name) + ', directly connected\n'; any = true; });
      }
    });
    (d.ipv6Routes || []).forEach((r) => { out += 'S   ' + r.net + '/' + r.prefix + ' [1/0]\n     via ' + r.nh + '\n'; any = true; });
    return any ? out : out + '(vazia)';
  }
  function showStandby(d, brief) {
    let rows = [];
    Object.values(d.interfaces).forEach((i) => {
      Object.values(i.standby || {}).forEach((s) => { rows.push({ i: i, s: s }); });
    });
    if (!rows.length) return '\n(nenhum grupo HSRP configurado)';
    if (brief) {
      let out = '\n                     P indicates configured to preempt.\n                     |\nInterface   Grp  Pri P State    Active          Standby         Virtual IP\n';
      rows.forEach((r) => {
        const active = r.s.priority >= 100 ? 'local' : 'unknown';
        out += pad(shortIface(r.i.name), 12) + pad(r.s.group, 5) + pad(r.s.priority, 4) + pad(r.s.preempt ? 'P' : ' ', 2) + pad('Active', 9) + pad('local', 16) + pad('unknown', 16) + (r.s.ip || '?') + '\n';
      });
      return out;
    }
    let out = '\n';
    rows.forEach((r) => {
      out += shortIface(r.i.name) + ' - Group ' + r.s.group + ' (version ' + (r.s.version || 2) + ')\n';
      out += '  State is Active\n';
      out += '  Virtual IP address is ' + (r.s.ip || 'unknown') + '\n';
      out += '  Priority ' + r.s.priority + (r.s.preempt ? ', preemption enabled' : '') + '\n';
    });
    return out;
  }
  function showNtp(d, which) {
    if (which === 'status') {
      if (!d.ntp.servers.length && !d.ntp.master) return '\n%NTP is not configured.';
      return '\nClock is synchronized, stratum ' + (d.ntp.master ? 1 : 3) + ', reference is ' + (d.ntp.servers[0] || 'local') + '\nreference time is C5... (NTP)';
    }
    if (!d.ntp.servers.length) return '\n(sem associações NTP)';
    let out = '\n  address         ref clock       st   when   poll reach\n';
    d.ntp.servers.forEach((s) => { out += '*~' + pad(s, 16) + pad('.LOCL.', 16) + pad('1', 5) + pad('12', 7) + pad('64', 5) + '377\n'; });
    out += '* master (synced)';
    return out;
  }
  function showLogging(d) {
    let out = '\nSyslog logging: enabled\n';
    out += '    Console logging: ' + (d.logging.console ? 'enabled' : 'disabled') + '\n';
    out += '    Buffer logging: ' + (d.logging.buffered ? 'enabled' : 'disabled') + '\n';
    out += '    Trap logging: ' + (d.logging.trap ? 'level ' + d.logging.trap : 'level informational') + '\n';
    if (d.logging.hosts.length) d.logging.hosts.forEach((h) => { out += '        Logging to ' + h + ' (udp port 514)\n'; });
    else out += '        (nenhum servidor syslog definido)\n';
    return out;
  }
  function showSnmp(d) {
    let out = '\nSNMP:\n';
    out += '  Location: ' + (d.snmp.location || '(não definido)') + '\n';
    out += '  Contact: ' + (d.snmp.contact || '(não definido)') + '\n';
    if (d.snmp.communities.length) d.snmp.communities.forEach((c) => { out += '  Community "' + c.name + '" (' + c.access + ')\n'; });
    else out += '  (nenhuma community configurada)\n';
    if (d.snmp.host) out += '  Trap host: ' + d.snmp.host + '\n';
    return out;
  }
  function showClassMap(d) {
    const names = Object.keys(d.qos.classMaps);
    if (!names.length) return '\n(nenhum class-map)';
    let out = '';
    names.forEach((n) => {
      const c = d.qos.classMaps[n];
      out += '\n Class Map ' + c.match + ' ' + c.name + '\n';
      c.matches.forEach((m) => { out += '   Match ' + m + '\n'; });
    });
    return out;
  }
  function showPolicyMap(d) {
    const names = Object.keys(d.qos.policyMaps);
    if (!names.length) return '\n(nenhum policy-map)';
    let out = '';
    names.forEach((n) => {
      const p = d.qos.policyMaps[n];
      out += '\n Policy Map ' + p.name + '\n';
      p.classes.forEach((c) => {
        out += '  Class ' + c.name + '\n';
        c.actions.forEach((a) => { out += '    ' + a + '\n'; });
      });
    });
    return out;
  }
  function showCrypto(d, what) {
    if (what === 'isakmp') {
      if (!d.crypto.isakmp.length) return '\n(nenhuma política ISAKMP)';
      let out = '\nGlobal IKE policy\n';
      d.crypto.isakmp.forEach((p) => {
        out += 'Protection suite of priority ' + p.seq + '\n';
        out += '  encryption: ' + (p.encryption || 'des') + '\n';
        out += '  hash: ' + (p.hash || 'sha') + '\n';
        out += '  authentication: ' + (p.auth || 'rsa-sig') + '\n';
        out += '  Diffie-Hellman group: ' + (p.group || '1') + '\n';
      });
      return out;
    }
    if (what === 'transform') {
      const ks = Object.keys(d.crypto.transformSets);
      if (!ks.length) return '\n(nenhum transform-set)';
      let out = '';
      ks.forEach((k) => { out += '\nTransform set ' + k + ': { ' + d.crypto.transformSets[k].transforms.join(', ') + ' }\n'; });
      return out;
    }
    if (what === 'map') {
      const ks = Object.keys(d.crypto.maps);
      if (!ks.length) return '\n(nenhum crypto map)';
      let out = '';
      ks.forEach((k) => {
        const m = d.crypto.maps[k];
        m.entries.forEach((e) => {
          out += '\nCrypto Map "' + m.name + '" ' + e.seq + ' ipsec-isakmp\n';
          out += '  Peer = ' + (e.peer || '(none)') + '\n';
          out += '  Transform sets={ ' + (e.transformSet || '(none)') + ' }\n';
          out += '  Match address: ' + (e.matchAcl || '(none)') + '\n';
        });
        // applied?
        let applied = [];
        Object.values(d.interfaces).forEach((i) => { if (i.cryptoMap === m.name) applied.push(shortIface(i.name)); });
        out += '  Interfaces using crypto map ' + m.name + ': ' + (applied.join(', ') || '(nenhuma)') + '\n';
      });
      return out;
    }
    return '\n(?)';
  }


  function execute(world, deviceId, raw) {
    const d = world.devices[deviceId];
    if (!d) return err('% device not found');
    let line = raw.trim();
    if (!line) return ok('');
    // "do" prefix in config modes
    let doPrefix = false;
    if (/^do\s+/.test(line) && d.mode !== 'user' && d.mode !== 'priv') { line = line.replace(/^do\s+/, ''); doPrefix = true; }
    const toks = line.split(/\s+/);
    const cmd = toks[0].toLowerCase();

    // PC / server commands
    if (d.type === 'pc' || d.type === 'server') return pcCommand(world, d, toks, line);
    // Wireless LAN Controller (SRWE wireless)
    if (d.type === 'wlc') return wlcCommand(world, d, toks, line);
    // Automation host (ENSA automação)
    if (d.type === 'automation') return autoCommand(world, d, toks, line);

    // SHOW (allowed in priv, and via do in config)
    if (cmd === 'show' || cmd === 'sh') {
      if (d.mode === 'user') return err('% Invalid input detected (use "enable" first for most show commands).\n' + tryUserShow(d, toks));
      return doShow(world, d, toks);
    }

    // global navigation
    switch (cmd) {
      case 'enable': case 'en': d.mode = 'priv'; return ok('');
      case 'disable': d.mode = 'user'; return ok('');
      case 'exit':
        if (d.mode === 'pmap-c') { d.mode = 'pmap'; delete d.ctx.pmapClass; return ok(''); }
        if (d.mode === 'cmap' || d.mode === 'pmap' || d.mode === 'isakmp' || d.mode === 'cryptomap') { d.mode = 'config'; d.ctx = {}; return ok(''); }
        if (d.mode === 'if' || d.mode === 'subif' || d.mode === 'vlan' || d.mode === 'router' || d.mode === 'line' || d.mode === 'dhcp' || d.mode === 'acl') { d.mode = 'config'; d.ctx = {}; return ok(''); }
        if (d.mode === 'config') { d.mode = 'priv'; return ok(''); }
        if (d.mode === 'priv') { d.mode = 'user'; return ok(''); }
        return ok('');
      case 'end': if (d.mode !== 'user') { d.mode = 'priv'; d.ctx = {}; } return ok('');
      case 'configure': case 'conf':
        if (d.mode === 'priv' && (toks[1] || '').toLowerCase().startsWith('t')) { d.mode = 'config'; return ok('Enter configuration commands, one per line.  End with CNTL/Z.'); }
        return err('% Use "configure terminal".');
      case 'ping': return ok(doPing(world, d, toks[1]));
      case 'traceroute': case 'tracert': return ok(doTrace(world, d, toks[1]));
      case 'write': case 'copy': return ok('Building configuration...\n[OK]');
      case 'clear': return ok('');
      case 'reload': return ok('Proceed with reload? [confirm]');
      case '?': return ok(helpText(d));
    }

    if (d.mode === 'priv') {
      return err('% Configure from "configure terminal".');
    }

    // CONFIG-LEVEL commands
    if (d.mode === 'config') return configCmd(world, d, toks, line);
    if (d.mode === 'if' || d.mode === 'subif') return ifCmd(world, d, toks, line);
    if (d.mode === 'vlan') return vlanModeCmd(world, d, toks, line);
    if (d.mode === 'router') return routerCmd(world, d, toks, line);
    if (d.mode === 'dhcp') return dhcpCmd(world, d, toks, line);
    if (d.mode === 'acl') return aclModeCmd(world, d, toks, line);
    if (d.mode === 'cmap') return cmapModeCmd(world, d, toks, line);
    if (d.mode === 'pmap') return pmapModeCmd(world, d, toks, line);
    if (d.mode === 'pmap-c') return pmapClassModeCmd(world, d, toks, line);
    if (d.mode === 'isakmp') return isakmpModeCmd(world, d, toks, line);
    if (d.mode === 'cryptomap') return cryptoMapModeCmd(world, d, toks, line);
    if (d.mode === 'line') return lineCmd(world, d, toks, line);

    return err('% Unknown command');
  }

  function tryUserShow() { return ''; }

  function doShow(world, d, toks) {
    const sub = (toks[1] || '').toLowerCase();
    const sub2 = (toks[2] || '').toLowerCase();
    const sub3 = (toks[3] || '').toLowerCase();
    if (sub === 'vlan') return ok(showVlanBrief(d));
    if (sub === 'interfaces' || sub === 'interface' || sub === 'int') {
      if (sub2 === 'trunk') return ok(showInterfacesTrunk(d) || '');
      if (sub2 === 'status') return ok(showInterfacesStatus(d));
      return ok(showInterfacesStatus(d));
    }
    if (sub === 'ip') {
      if (sub2 === 'route') return ok(showIpRoute(d));
      if (sub2 === 'interface' && sub3 === 'brief') return ok(showIpIntBrief(d));
      if (sub2 === 'int' && sub3 === 'br') return ok(showIpIntBrief(d));
      if (sub2 === 'ospf' && sub3 === 'neighbor') return ok(showOspfNeighbor(d) || '');
      if (sub2 === 'protocols') return ok(showIpProtocols(d));
      if (sub2 === 'ssh') return ok('\nSSH ' + (d.security.sshVersion ? 'Enabled - version ' + d.security.sshVersion : 'Disabled') + '\nAuthentication methods: ' + (d.security.vty.loginLocal ? 'local' : 'none') + '\nTransport: ' + (d.security.vty.transport || 'all')); 
      if (sub2 === 'nat' && sub3 === 'translations') return ok(showNatTranslations(d) || '');
      if (sub2 === 'dhcp' && sub3 === 'binding') return ok(showDhcpBinding(d) || '');
      if (sub2 === 'access-lists' || sub2 === 'access-list') return ok(showAccessLists(d) || '');
      if (sub2 === 'ospf') return ok('\n Routing Process "ospf ' + (d.ospf ? d.ospf.pid : '?') + '"');
    }
    if (sub === 'ipv6') {
      if (sub2 === 'interface' && sub3 === 'brief') return ok(showIpv6IntBrief(d));
      if (sub2 === 'int' && sub3 === 'br') return ok(showIpv6IntBrief(d));
      if (sub2 === 'route') return ok(showIpv6Route(d));
      if (sub2 === 'interface') return ok(showIpv6IntBrief(d));
      return ok(showIpv6IntBrief(d));
    }
    if (sub === 'standby') return ok(showStandby(d, sub2 === 'brief'));
    if (sub === 'ntp') return ok(showNtp(d, sub2 === 'status' ? 'status' : 'assoc'));
    if (sub === 'logging') return ok(showLogging(d));
    if (sub === 'snmp') return ok(showSnmp(d));
    if (sub === 'class-map') return ok(showClassMap(d));
    if (sub === 'policy-map') return ok(showPolicyMap(d));
    if (sub === 'crypto') {
      if (sub2 === 'isakmp') return ok(showCrypto(d, 'isakmp'));
      if (sub2 === 'ipsec' && sub3 === 'transform-set') return ok(showCrypto(d, 'transform'));
      if (sub2 === 'ipsec') return ok(showCrypto(d, 'map'));
      if (sub2 === 'map') return ok(showCrypto(d, 'map'));
      return ok(showCrypto(d, 'isakmp'));
    }
    if (sub === 'spanning-tree') return ok(showSpanningTree(d));
    if (sub === 'etherchannel') return ok(showEtherchannel(d));
    if (sub === 'port-security') {
      if (sub2 === 'interface') return ok(showPortSecurity(d, toks[3]));
      return ok(showPortSecurity(d));
    }
    if (sub === 'mac' || sub === 'mac-address-table') return ok(showMacTable(d));
    if (sub === 'access-lists' || sub === 'access-list') return ok(showAccessLists(d) || '');
    if (sub === 'running-config' || (sub === 'run')) return ok(showRun(d));
    if (sub === 'startup-config' || sub === 'start') return ok(showRun(d));
    if (sub === 'version') return ok('\nCisco IOS Software, Version 15.2(4)\nNetwork Ops Academy simulated device\nuptime is 4 hours\n');
    if (sub === 'cdp') return ok(showCdp(d));
    return err('% Invalid input detected at show "' + (toks.slice(1).join(' ')) + '"');
  }

  function showCdp(d) {
    if (!d.cdp || !d.cdp.length) return 'No CDP neighbors.';
    let out = '\nDevice ID    Local Intrfce   Holdtme   Capability   Platform   Port ID\n';
    d.cdp.forEach((n) => { out += pad(n.id, 13) + pad(n.local, 16) + pad(n.hold || 150, 10) + pad(n.cap || 'R S', 13) + pad(n.platform || 'C2900', 11) + n.port + '\n'; });
    return out.replace(/\n$/, '');
  }

  // ---- config mode ---------------------------------------------------------
  function configCmd(world, d, toks, line) {
    const cmd = toks[0].toLowerCase();
    if (cmd === 'hostname') { if (!toks[1]) return err('% Incomplete command.'); d.name = toks[1]; return ok(''); }
    if (cmd === 'interface' || cmd === 'int') {
      const ifname = normIface(toks.slice(1).join(''));
      // subinterface?
      if (/\.\d+$/.test(ifname)) {
        const parent = ifname.replace(/\.\d+$/, '');
        if (!d.interfaces[parent]) return err('% Parent interface ' + parent + ' not found.');
        if (!d.interfaces[ifname]) {
          d.interfaces[ifname] = newIface(ifname, { isSwitchport: false, parent, adminUp: true, connected: d.interfaces[parent].connected });
        }
        d.mode = 'subif'; d.ctx = { iface: ifname }; return ok('');
      }
      if (!d.interfaces[ifname]) {
        if (/^Vlan\d+/.test(ifname)) { d.interfaces[ifname] = newIface(ifname, { isSwitchport: false, adminUp: false }); }
        else if (/^Port-channel\d+/.test(ifname)) { d.interfaces[ifname] = newIface(ifname, { isSwitchport: d.type === 'switch' }); }
        else return err('% Invalid interface ' + ifname);
      }
      d.mode = 'if'; d.ctx = { iface: ifname };
      return ok('');
    }
    if (cmd === 'vlan') {
      const vid = parseInt(toks[1], 10);
      if (!vid) return err('% Incomplete command.');
      if (!d.vlans[vid]) d.vlans[vid] = { id: vid, name: 'VLAN' + String(vid).padStart(4, '0'), status: 'active' };
      d.mode = 'vlan'; d.ctx = { vlan: vid };
      return ok('');
    }
    if (cmd === 'no' && (toks[1] || '').toLowerCase() === 'vlan') { delete d.vlans[parseInt(toks[2], 10)]; return ok(''); }
    if (cmd === 'ip' && (toks[1] || '').toLowerCase() === 'routing') { d.ipRouting = true; recompute(d); return ok(''); }
    if (cmd === 'no' && (toks[1] || '').toLowerCase() === 'ip' && (toks[2] || '').toLowerCase() === 'routing') { d.ipRouting = false; return ok(''); }
    if (cmd === 'ip' && (toks[1] || '').toLowerCase() === 'route') {
      d.staticRoutes.push({ net: toks[2], mask: toks[3], nh: /\d+\.\d+\.\d+\.\d+/.test(toks[4]) ? toks[4] : null, iface: /\d+\.\d+\.\d+\.\d+/.test(toks[4]) ? null : normIface(toks.slice(4).join('')) });
      return ok('');
    }
    if (cmd === 'router' && (toks[1] || '').toLowerCase() === 'ospf') {
      const pid = parseInt(toks[2], 10) || 1;
      if (!d.ospf) d.ospf = { pid, networks: [], passive: [], routerId: null };
      d.ospf.pid = pid;
      d.mode = 'router'; d.ctx = { proto: 'ospf' };
      return ok('');
    }
    if (cmd === 'access-list') return numberedAcl(d, toks);
    if (cmd === 'ip' && (toks[1] || '').toLowerCase() === 'access-list') {
      const type = (toks[2] || '').toLowerCase(); const name = toks[3];
      if (!name) return err('% Incomplete command.');
      if (!d.acls[name]) d.acls[name] = { type, named: true, rules: [] };
      d.mode = 'acl'; d.ctx = { acl: name, aclType: type };
      return ok('');
    }
    if (cmd === 'ip' && (toks[1] || '').toLowerCase() === 'nat' && (toks[2] || '').toLowerCase() === 'inside') {
      // ip nat inside source list X interface Y overload
      if ((toks[3] || '').toLowerCase() === 'source') {
        const acl = toks[5];
        let iface = null, pool = null, overload = /overload/i.test(line);
        const ifIdx = toks.indexOf('interface');
        if (ifIdx >= 0) iface = normIface(toks[ifIdx + 1]);
        d.nat.rules.push({ acl, iface, overload });
        d.nat.pat = overload;
        return ok('');
      }
    }
    if (cmd === 'ip' && (toks[1] || '').toLowerCase() === 'dhcp') {
      if ((toks[2] || '').toLowerCase() === 'pool') {
        const name = toks[3];
        if (!d.dhcp.pools[name]) d.dhcp.pools[name] = { name };
        d.mode = 'dhcp'; d.ctx = { pool: name };
        return ok('');
      }
      if ((toks[2] || '').toLowerCase() === 'excluded-address') {
        d.dhcp.excluded.push({ from: toks[3], to: toks[4] || null });
        return ok('');
      }
    }
    // ---- SRWE: IPv6 routing ----
    if (cmd === 'ipv6' && (toks[1] || '').toLowerCase() === 'unicast-routing') { d.ipv6Routing = true; return ok(''); }
    if (cmd === 'no' && (toks[1] || '').toLowerCase() === 'ipv6' && (toks[2] || '').toLowerCase() === 'unicast-routing') { d.ipv6Routing = false; return ok(''); }
    if (cmd === 'ipv6' && (toks[1] || '').toLowerCase() === 'route') {
      const dest = toks[2] || ''; const parts = dest.split('/');
      d.ipv6Routes.push({ net: (parts[0] || '').toLowerCase(), prefix: parseInt(parts[1], 10) || 64, nh: (toks[3] || '').toLowerCase() });
      return ok('');
    }
    // ---- ENSA: gestão de rede (NTP / Syslog / SNMP) ----
    if (cmd === 'ntp') {
      const s1 = (toks[1] || '').toLowerCase();
      if (s1 === 'server') { if (!d.ntp.servers.includes(toks[2])) d.ntp.servers.push(toks[2]); return ok(''); }
      if (s1 === 'master') { d.ntp.master = true; return ok(''); }
      if (s1 === 'update-calendar' || s1 === 'authenticate') return ok('');
      return ok('');
    }
    if (cmd === 'no' && (toks[1] || '').toLowerCase() === 'ntp') {
      if ((toks[2] || '').toLowerCase() === 'server') d.ntp.servers = d.ntp.servers.filter((x) => x !== toks[3]);
      return ok('');
    }
    if (cmd === 'logging') {
      const s1 = (toks[1] || '').toLowerCase();
      if (s1 === 'host') { if (!d.logging.hosts.includes(toks[2])) d.logging.hosts.push(toks[2]); return ok(''); }
      if (s1 === 'trap') { d.logging.trap = toks[2]; return ok(''); }
      if (s1 === 'buffered') { d.logging.buffered = true; return ok(''); }
      if (s1 === 'console') { d.logging.console = true; return ok(''); }
      if (s1 === 'on') return ok('');
      if (/^\d+\.\d+\.\d+\.\d+$/.test(toks[1])) { if (!d.logging.hosts.includes(toks[1])) d.logging.hosts.push(toks[1]); return ok(''); }
      return ok('');
    }
    if (cmd === 'snmp-server') {
      const s1 = (toks[1] || '').toLowerCase();
      if (s1 === 'community') { d.snmp.communities.push({ name: toks[2], access: (toks[3] || 'RO').toUpperCase() }); return ok(''); }
      if (s1 === 'location') { d.snmp.location = toks.slice(2).join(' '); return ok(''); }
      if (s1 === 'contact') { d.snmp.contact = toks.slice(2).join(' '); return ok(''); }
      if (s1 === 'host') { d.snmp.host = toks[2]; return ok(''); }
      if (s1 === 'enable') return ok('');
      return ok('');
    }
    // ---- ENSA: QoS ----
    if (cmd === 'class-map') {
      let name = toks[1]; let match = 'match-all';
      if (toks[1] === 'match-any' || toks[1] === 'match-all') { match = toks[1]; name = toks[2]; }
      if (!d.qos.classMaps[name]) d.qos.classMaps[name] = { name, match, matches: [] };
      d.mode = 'cmap'; d.ctx = { cmap: name };
      return ok('');
    }
    if (cmd === 'policy-map') {
      const name = toks[1];
      if (!d.qos.policyMaps[name]) d.qos.policyMaps[name] = { name, classes: [] };
      d.mode = 'pmap'; d.ctx = { pmap: name };
      return ok('');
    }
    // ---- ENSA: VPN / IPsec ----
    if (cmd === 'crypto') {
      const s1 = (toks[1] || '').toLowerCase();
      if (s1 === 'isakmp' && (toks[2] || '').toLowerCase() === 'policy') {
        const seq = parseInt(toks[3], 10) || 10;
        let pol = d.crypto.isakmp.find((p) => p.seq === seq);
        if (!pol) { pol = { seq: seq }; d.crypto.isakmp.push(pol); }
        d.mode = 'isakmp'; d.ctx = { isakmp: seq };
        return ok('');
      }
      if (s1 === 'isakmp' && (toks[2] || '').toLowerCase() === 'key') {
        d.crypto.psk = { key: toks[3], peer: (toks.indexOf('address') >= 0 ? toks[toks.indexOf('address') + 1] : null) };
        return ok('');
      }
      if (s1 === 'ipsec' && (toks[2] || '').toLowerCase() === 'transform-set') {
        const name = toks[3];
        d.crypto.transformSets[name] = { name, transforms: toks.slice(4) };
        return ok('');
      }
      if (s1 === 'map') {
        const name = toks[2]; const seq = parseInt(toks[3], 10) || 10;
        if (!d.crypto.maps[name]) d.crypto.maps[name] = { name, entries: [] };
        let entry = d.crypto.maps[name].entries.find((e) => e.seq === seq);
        if (!entry) { entry = { seq: seq, peer: null, transformSet: null, matchAcl: null }; d.crypto.maps[name].entries.push(entry); }
        d.mode = 'cryptomap'; d.ctx = { cryptomap: name, cmseq: seq };
        return ok('');
      }
      if (s1 === 'key') { d.security.rsaGenerated = true; return ok(''); } // crypto key generate rsa
      return ok('');
    }
    if (cmd === 'username') { d.security.users.push({ name: toks[1], secret: toks.slice(2).join(' ') }); return ok(''); }
    if (cmd === 'ip' && (toks[1] || '').toLowerCase() === 'domain-name') { d.security.domainName = toks[2]; return ok(''); }
    if (cmd === 'ip' && (toks[1] || '').toLowerCase() === 'ssh' && (toks[2] || '').toLowerCase() === 'version') { d.security.sshVersion = toks[3]; return ok(''); }
    if (cmd === 'banner') { d.banner = line.replace(/^banner\s+\w+\s+/, ''); return ok(''); }
    if (cmd === 'line') { d.mode = 'line'; d.ctx = { line: toks.slice(1).join(' ') }; return ok(''); }
    if (cmd === 'enable') return ok(''); // enable secret etc
    if (cmd === 'no') return ok(''); // tolerate generic "no ..."
    if (cmd === 'spanning-tree') return spanningGlobal(d, toks);
    return err('% Invalid input detected: "' + line + '"');
  }

  function spanningGlobal(d, toks) {
    // spanning-tree vlan N root primary / priority P
    if ((toks[1] || '').toLowerCase() === 'vlan') {
      const vid = parseInt(toks[2], 10);
      if (!d.stp) d.stp = { vlans: [vid], rootFor: [], ports: [] };
      if ((toks[3] || '').toLowerCase() === 'root' && (toks[4] || '').toLowerCase() === 'primary') {
        d.stp.priority = 24576; if (!d.stp.rootFor.includes(vid)) d.stp.rootFor.push(vid);
        if (!d.stp.vlans.includes(vid)) d.stp.vlans.push(vid);
      } else if ((toks[3] || '').toLowerCase() === 'priority') {
        const p = parseInt(toks[4], 10); d.stp.priority = p;
        if (p <= 24576 && !d.stp.rootFor.includes(vid)) d.stp.rootFor.push(vid);
      }
      return ok('');
    }
    return ok('');
  }

  function numberedAcl(d, toks) {
    const num = toks[1];
    if (!d.acls[num]) d.acls[num] = { type: (+num < 100 ? 'standard' : 'extended'), named: false, rules: [] };
    const action = (toks[2] || '').toLowerCase();
    if (action !== 'permit' && action !== 'deny') return err('% Invalid ACL action.');
    let r = { action };
    if (+num < 100) {
      // standard: access-list N permit SRC [WILD] | host X | any
      r.src = toks[3] === 'host' ? toks[4] : toks[3];
      if (toks[3] !== 'host' && toks[3] !== 'any' && toks[4]) r.srcWild = toks[4];
    } else {
      // extended: action proto src [wild] dst [wild] [eq port]
      r.proto = toks[3];
      let i = 4;
      const parseAddr = () => {
        if (toks[i] === 'any') { i++; return { a: 'any' }; }
        if (toks[i] === 'host') { const a = toks[i + 1]; i += 2; return { a }; }
        const a = toks[i]; const w = toks[i + 1]; i += 2; return { a, w };
      };
      const s = parseAddr(); r.src = s.a; if (s.w) r.srcWild = s.w;
      const ds = parseAddr(); r.dst = ds.a; if (ds.w) r.dstWild = ds.w;
      if ((toks[i] || '').toLowerCase() === 'eq') r.port = toks[i + 1];
    }
    d.acls[num].rules.push(r);
    return ok('');
  }

  // ---- interface mode ------------------------------------------------------
  function ifCmd(world, d, toks, line) {
    const i = d.interfaces[d.ctx.iface];
    const cmd = toks[0].toLowerCase();
    // IOS allows jumping straight to another global-config context from interface mode.
    if (cmd === 'interface' || cmd === 'int' || cmd === 'vlan' ||
        (cmd === 'router' && (toks[1] || '').toLowerCase() === 'ospf') ||
        (cmd === 'ip' && ['route', 'access-list', 'dhcp', 'routing'].includes((toks[1] || '').toLowerCase())) ||
        (cmd === 'ipv6' && ['route', 'unicast-routing'].includes((toks[1] || '').toLowerCase())) ||
        cmd === 'ntp' || cmd === 'logging' || cmd === 'snmp-server' || cmd === 'class-map' || cmd === 'policy-map' ||
        cmd === 'access-list' || cmd === 'hostname' || cmd === 'line' || cmd === 'banner') {
      d.mode = 'config'; d.ctx = {};
      return configCmd(world, d, toks, line);
    }
    const isNo = cmd === 'no';
    const c = isNo ? (toks[1] || '').toLowerCase() : cmd;
    const rest = isNo ? toks.slice(2) : toks.slice(1);

    if (c === 'shutdown') { i.adminUp = isNo; recompute(d); return ok('%LINK-' + (isNo ? '3-UPDOWN' : '5-CHANGED') + ': Interface ' + i.name + ', changed state to ' + (isNo ? 'up' : 'administratively down')); }
    if (c === 'description') { i.description = isNo ? '' : line.replace(/^description\s+/, ''); return ok(''); }
    if (c === 'ip' && (rest[0] || '').toLowerCase() === 'address') {
      if (isNo) { i.ip = null; i.mask = null; recompute(d); return ok(''); }
      i.ip = rest[1]; i.mask = rest[2]; i.isSwitchport = false; recompute(d); return ok('');
    }
    if (c === 'ip' && (rest[0] || '').toLowerCase() === 'nat') { i.ipNat = isNo ? null : (rest[1] || '').toLowerCase(); return ok(''); }
    if (c === 'ip' && (rest[0] || '').toLowerCase() === 'helper-address') { i.helper = isNo ? null : rest[1]; return ok(''); }
    if (c === 'ip' && (rest[0] || '').toLowerCase() === 'ospf') { return ok(''); }
    // ---- SRWE: IPv6 endereçamento ----
    if (c === 'ipv6' && (rest[0] || '').toLowerCase() === 'address') {
      if (isNo) { i.ipv6 = []; recompute(d); return ok(''); }
      const a = (rest[1] || ''); const parts = a.split('/');
      const eui = /eui-64/i.test(line);
      i.ipv6.push({ addr: (parts[0] || '').toLowerCase(), prefix: parseInt(parts[1], 10) || 64, eui: eui });
      i.isSwitchport = false; recompute(d); return ok('');
    }
    if (c === 'ipv6' && (rest[0] || '').toLowerCase() === 'enable') { i.ipv6Enabled = !isNo; return ok(''); }
    // ---- SRWE: HSRP / FHRP ----
    if (c === 'standby') {
      if (isNo && rest.length <= 1) { i.standby = {}; return ok(''); }
      let g = 0, idx = 0;
      if (/^\d+$/.test(rest[0])) { g = parseInt(rest[0], 10); idx = 1; } else { g = 0; idx = 0; }
      if (!i.standby[g]) i.standby[g] = { group: g, ip: null, priority: 100, preempt: false, version: 2 };
      const kw = (rest[idx] || '').toLowerCase();
      if (kw === 'ip') { i.standby[g].ip = rest[idx + 1] || null; }
      else if (kw === 'priority') { i.standby[g].priority = parseInt(rest[idx + 1], 10); }
      else if (kw === 'preempt') { i.standby[g].preempt = !isNo; }
      else if (kw === 'version') { i.standby[g].version = parseInt(rest[idx + 1], 10); }
      else if (kw === 'track') { i.standby[g].track = rest[idx + 1]; }
      return ok('');
    }
    // ---- ENSA: QoS aplicada à interface ----
    if (c === 'service-policy') {
      const dir = (rest[0] || '').toLowerCase(); const name = rest[1];
      if (!i.servicePolicy) i.servicePolicy = {};
      if (dir === 'input') i.servicePolicy.in = isNo ? null : name;
      else if (dir === 'output') i.servicePolicy.out = isNo ? null : name;
      return ok('');
    }
    // ---- ENSA: aplicar crypto map ----
    if (c === 'crypto' && (rest[0] || '').toLowerCase() === 'map') {
      i.cryptoMap = isNo ? null : rest[1];
      return ok(i.cryptoMap ? '%CRYPTO-6-ISAKMP_ON_OFF: ISAKMP is ON' : '');
    }
    if (c === 'encapsulation') {
      // encapsulation dot1Q N [native]
      const vlan = parseInt(rest[1], 10);
      i.encap = { dot1q: vlan, native: /native/i.test(line) };
      i.isSwitchport = false;
      return ok('');
    }
    if (c === 'switchport') {
      const s1 = (rest[0] || '').toLowerCase();
      if (isNo && s1 === '') { i.isSwitchport = false; i.mode = 'routed'; return ok(''); }
      if (s1 === 'mode') {
        const m = (rest[1] || '').toLowerCase();
        if (m === 'access') i.mode = 'access';
        else if (m === 'trunk') i.mode = 'trunk';
        else if (m === 'dynamic') i.mode = 'dynamic';
        recompute(d); return ok('');
      }
      if (s1 === 'access' && (rest[1] || '').toLowerCase() === 'vlan') {
        const vid = parseInt(rest[2], 10);
        if (isNo) { i.accessVlan = 1; return ok(''); }
        if (!d.vlans[vid]) {
          // IOS auto-creates? It warns. We'll auto-create for playability but note it.
          d.vlans[vid] = { id: vid, name: 'VLAN' + String(vid).padStart(4, '0'), status: 'active' };
          i.accessVlan = vid;
          return ok('% Access VLAN does not exist. Creating vlan ' + vid);
        }
        i.accessVlan = vid; return ok('');
      }
      if (s1 === 'trunk') {
        const t = (rest[1] || '').toLowerCase();
        if (t === 'native' && (rest[2] || '').toLowerCase() === 'vlan') { i.nativeVlan = isNo ? 1 : parseInt(rest[3], 10); return ok(''); }
        if (t === 'allowed' && (rest[2] || '').toLowerCase() === 'vlan') { i.trunkAllowed = isNo ? 'all' : rest.slice(3).join(' '); return ok(''); }
        if (t === 'encapsulation') { i.trunkEncap = (rest[2] || 'dot1q').toLowerCase(); return ok(''); }
        return ok('');
      }
      if (s1 === 'port-security') return portSecCmd(i, rest, isNo, line);
      if (s1 === 'voice' && (rest[1] || '').toLowerCase() === 'vlan') { i.voiceVlan = parseInt(rest[2], 10); return ok(''); }
      return ok('');
    }
    if (c === 'channel-group') {
      const id = parseInt(rest[0], 10);
      const modeIdx = rest.indexOf('mode');
      const mode = modeIdx >= 0 ? (rest[modeIdx + 1] || '').toLowerCase() : 'on';
      if (isNo) { i.channelGroup = null; return ok(''); }
      i.channelGroup = { id, mode };
      return ok('Creating a port-channel interface Port-channel ' + id);
    }
    if (c === 'spanning-tree') {
      const s1 = (rest[0] || '').toLowerCase();
      if (s1 === 'portfast') { i.portfast = !isNo; return ok(i.portfast ? '%Warning: portfast should only be enabled on ports connected to a single host.' : ''); }
      if (s1 === 'bpduguard') { i.bpduguard = !isNo; return ok(''); }
      return ok('');
    }
    if (c === 'speed') { i.speed = rest[0]; return ok(''); }
    if (c === 'duplex') { i.duplex = rest[0]; return ok(''); }
    if (c === 'exit') { d.mode = 'config'; d.ctx = {}; return ok(''); }
    return err('% Invalid input in interface mode: "' + line + '"');
  }

  function portSecCmd(i, rest, isNo, line) {
    if (!i.portSecurity) i.portSecurity = { enabled: false, max: 1, violation: 'shutdown', sticky: false, macs: [], violations: 0 };
    const ps = i.portSecurity;
    if (rest.length === 1) { ps.enabled = !isNo; return ok(''); } // "switchport port-security"
    const s2 = (rest[1] || '').toLowerCase();
    if (s2 === 'maximum') { ps.max = parseInt(rest[2], 10); return ok(''); }
    if (s2 === 'violation') { ps.violation = (rest[2] || 'shutdown').toLowerCase(); return ok(''); }
    if (s2 === 'mac-address') {
      if ((rest[2] || '').toLowerCase() === 'sticky') { ps.sticky = !isNo; return ok(''); }
      ps.macs.push((rest[2] || '').toLowerCase()); return ok('');
    }
    return ok('');
  }

  function vlanModeCmd(world, d, toks, line) {
    const v = d.vlans[d.ctx.vlan];
    const cmd = toks[0].toLowerCase();
    if (cmd === 'name') { v.name = toks[1]; return ok(''); }
    if (cmd === 'exit') { d.mode = 'config'; d.ctx = {}; return ok(''); }
    if (cmd === 'shutdown') { v.status = 'act/lshut'; return ok(''); }
    if (cmd === 'no' && (toks[1] || '').toLowerCase() === 'shutdown') { v.status = 'active'; return ok(''); }
    return err('% Invalid input in vlan mode');
  }

  function routerCmd(world, d, toks, line) {
    const cmd = toks[0].toLowerCase();
    const isNo = cmd === 'no';
    const c = isNo ? (toks[1] || '').toLowerCase() : cmd;
    const rest = isNo ? toks.slice(2) : toks.slice(1);
    if (c === 'network') {
      const net = rest[0]; const wild = rest[1];
      const areaIdx = rest.indexOf('area');
      const area = areaIdx >= 0 ? parseInt(rest[areaIdx + 1], 10) : 0;
      if (isNo) {
        d.ospf.networks = d.ospf.networks.filter((n) => !(n.net === net && n.wild === wild));
      } else {
        d.ospf.networks.push({ net, wild, area });
      }
      return ok('');
    }
    if (c === 'router-id') { d.ospf.routerId = isNo ? null : rest[0]; return ok(isNo ? '' : '% router-id will take effect after "clear ip ospf process"'); }
    if (c === 'passive-interface') {
      const ifn = normIface(rest.join(''));
      if (isNo) d.ospf.passive = (d.ospf.passive || []).filter((p) => p !== ifn);
      else { d.ospf.passive = d.ospf.passive || []; if (!d.ospf.passive.includes(ifn)) d.ospf.passive.push(ifn); }
      return ok('');
    }
    if (c === 'default-information' || c === 'auto-cost' || c === 'log-adjacency-changes') return ok('');
    if (c === 'exit') { d.mode = 'config'; d.ctx = {}; return ok(''); }
    return err('% Invalid input in router mode');
  }

  function dhcpCmd(world, d, toks, line) {
    const p = d.dhcp.pools[d.ctx.pool];
    const cmd = toks[0].toLowerCase();
    if (cmd === 'network') { p.network = toks[1]; p.mask = toks[2]; return ok(''); }
    if (cmd === 'default-router') { p.defaultRouter = toks[1]; return ok(''); }
    if (cmd === 'dns-server') { p.dns = toks[1]; return ok(''); }
    if (cmd === 'domain-name') { p.domain = toks[1]; return ok(''); }
    if (cmd === 'exit') { d.mode = 'config'; d.ctx = {}; return ok(''); }
    return err('% Invalid input in dhcp mode');
  }

  function aclModeCmd(world, d, toks, line) {
    const a = d.acls[d.ctx.acl];
    const cmd = toks[0].toLowerCase();
    if (cmd === 'exit') { d.mode = 'config'; d.ctx = {}; return ok(''); }
    if (cmd === 'permit' || cmd === 'deny') {
      // mimic numbered parser
      const fake = ['access-list', a.type === 'extended' ? '110' : '10'].concat(toks);
      const tmp = { acls: {} };
      const res = numberedAcl(tmp, fake);
      const key = Object.keys(tmp.acls)[0];
      a.rules.push(tmp.acls[key].rules[0]);
      return ok('');
    }
    if (cmd === 'remark') return ok('');
    return err('% Invalid input in acl mode');
  }

  // ---- QoS: class-map / policy-map modes -----------------------------------
  function cmapModeCmd(world, d, toks, line) {
    const cm = d.qos.classMaps[d.ctx.cmap];
    const cmd = toks[0].toLowerCase();
    if (cmd === 'match') {
      cm.matches.push(toks.slice(1).join(' '));
      return ok('');
    }
    if (cmd === 'exit') { d.mode = 'config'; d.ctx = {}; return ok(''); }
    if (cmd === 'description') return ok('');
    return err('% Invalid input in class-map mode');
  }
  function pmapModeCmd(world, d, toks, line) {
    const pm = d.qos.policyMaps[d.ctx.pmap];
    const cmd = toks[0].toLowerCase();
    if (cmd === 'class') {
      const name = toks[1];
      let c = pm.classes.find((x) => x.name === name);
      if (!c) { c = { name, actions: [] }; pm.classes.push(c); }
      d.mode = 'pmap-c'; d.ctx.pmapClass = name;
      return ok('');
    }
    if (cmd === 'exit') { d.mode = 'config'; d.ctx = {}; return ok(''); }
    return err('% Invalid input in policy-map mode');
  }
  function pmapClassModeCmd(world, d, toks, line) {
    const pm = d.qos.policyMaps[d.ctx.pmap];
    const c = pm.classes.find((x) => x.name === d.ctx.pmapClass);
    const cmd = toks[0].toLowerCase();
    if (cmd === 'priority' || cmd === 'bandwidth' || cmd === 'police' || cmd === 'set' || cmd === 'shape' || cmd === 'queue-limit' || cmd === 'random-detect') {
      c.actions.push(line.trim());
      return ok('');
    }
    if (cmd === 'class') { return pmapModeCmd(world, d, toks, line); }
    if (cmd === 'exit') { d.mode = 'pmap'; delete d.ctx.pmapClass; return ok(''); }
    return err('% Invalid input in policy-map-class mode');
  }
  // ---- VPN: isakmp / crypto-map modes --------------------------------------
  function isakmpModeCmd(world, d, toks, line) {
    const pol = d.crypto.isakmp.find((p) => p.seq === d.ctx.isakmp);
    const cmd = toks[0].toLowerCase();
    if (cmd === 'encryption') { pol.encryption = toks[1]; return ok(''); }
    if (cmd === 'hash') { pol.hash = toks[1]; return ok(''); }
    if (cmd === 'authentication') { pol.auth = toks.slice(1).join(' '); return ok(''); }
    if (cmd === 'group') { pol.group = toks[1]; return ok(''); }
    if (cmd === 'lifetime') { pol.lifetime = toks[1]; return ok(''); }
    if (cmd === 'exit') { d.mode = 'config'; d.ctx = {}; return ok(''); }
    return err('% Invalid input in isakmp mode');
  }
  function cryptoMapModeCmd(world, d, toks, line) {
    const map = d.crypto.maps[d.ctx.cryptomap];
    const e = map.entries.find((x) => x.seq === d.ctx.cmseq);
    const cmd = toks[0].toLowerCase();
    if (cmd === 'set') {
      const s1 = (toks[1] || '').toLowerCase();
      if (s1 === 'peer') e.peer = toks[2];
      else if (s1 === 'transform-set') e.transformSet = toks[2];
      else if (s1 === 'security-association') e.sa = toks.slice(2).join(' ');
      return ok('');
    }
    if (cmd === 'match' && (toks[1] || '').toLowerCase() === 'address') { e.matchAcl = toks[2]; return ok(''); }
    if (cmd === 'exit') { d.mode = 'config'; d.ctx = {}; return ok(''); }
    return err('% Invalid input in crypto-map mode');
  }


  function lineCmd(world, d, toks, line) {
    const cmd = (toks[0] || '').toLowerCase();
    if (cmd === 'exit') { d.mode = 'config'; d.ctx = {}; return ok(''); }
    if (cmd === 'transport' && (toks[1] || '').toLowerCase() === 'input') { d.security.vty.transport = toks.slice(2).join(' '); return ok(''); }
    if (cmd === 'login' && (toks[1] || '').toLowerCase() === 'local') { d.security.vty.loginLocal = true; return ok(''); }
    if (cmd === 'password' || cmd === 'exec-timeout') return ok('');
    return ok('');
  }

  // ---- Wireless LAN Controller (SRWE) --------------------------------------
  // Modelo simplificado do CLI de um WLC Cisco.
  function wlcCommand(world, d, toks, line) {
    if (!d.wlan) d.wlan = { wlans: {}, interfaces: { management: { vlan: 1 } } };
    const cmd = toks[0].toLowerCase();
    if (cmd === '?' ) return ok('config wlan create <id> <profile> <ssid>\nconfig wlan security wpa akm psk {enable|disable}\nconfig wlan security wpa akm psk set-key ascii <pwd>\nconfig wlan interface <id> <iface>\nconfig wlan enable <id>\nshow wlan summary');
    if (cmd === 'show') {
      const s1 = (toks[1] || '').toLowerCase();
      if (s1 === 'wlan' && (toks[2] || '').toLowerCase() === 'summary') return ok(showWlanSummary(d));
      if (s1 === 'wlan') return ok(showWlanSummary(d));
      if (s1 === 'interface' && (toks[2] || '').toLowerCase() === 'summary') {
        let out = '\nInterface Name      VLAN\n------------------- ----\n';
        Object.keys(d.wlan.interfaces).forEach((k) => { out += pad(k, 20) + d.wlan.interfaces[k].vlan + '\n'; });
        return ok(out);
      }
      return err('% comando show não reconhecido no WLC');
    }
    if (cmd === 'config') {
      const s1 = (toks[1] || '').toLowerCase();
      if (s1 === 'wlan') {
        const op = (toks[2] || '').toLowerCase();
        if (op === 'create') {
          const id = toks[3]; const profile = toks[4]; const ssid = toks[5] || toks[4];
          d.wlan.wlans[id] = { id, profile, ssid, enabled: false, security: 'open', psk: null, iface: 'management' };
          return ok('WLAN ' + id + ' criada (perfil "' + profile + '", SSID "' + ssid + '").');
        }
        const w = d.wlan.wlans[toks[3]] || (op === 'security' ? d.wlan.wlans[toks[toks.length - 1]] : null);
        if (op === 'security') {
          // config wlan security wpa akm psk enable <id>  /  set-key ascii <pwd> <id>
          const id = toks[toks.length - 1];
          const wl = d.wlan.wlans[id];
          if (!wl) return err('% WLAN ' + id + ' inexistente.');
          if (line.indexOf('psk enable') >= 0 || line.indexOf('akm psk enable') >= 0) { wl.security = 'wpa2-psk'; return ok('WPA2-PSK ativado na WLAN ' + id + '.'); }
          if (line.indexOf('set-key') >= 0) { const m = line.match(/ascii\s+(\S+)/); wl.psk = m ? m[1] : null; return ok('Chave PSK definida na WLAN ' + id + '.'); }
          if (line.indexOf('802.1x disable') >= 0 || line.indexOf('wpa enable') >= 0) return ok('');
          return ok('');
        }
        if (op === 'interface') {
          const id = toks[3]; const iface = toks[4];
          if (d.wlan.wlans[id]) d.wlan.wlans[id].iface = iface;
          return ok('WLAN ' + id + ' mapeada para interface "' + iface + '".');
        }
        if (op === 'enable') { const id = toks[3]; if (d.wlan.wlans[id]) d.wlan.wlans[id].enabled = true; return ok('WLAN ' + id + ' ativada.'); }
        if (op === 'disable') { const id = toks[3]; if (d.wlan.wlans[id]) d.wlan.wlans[id].enabled = false; return ok('WLAN ' + id + ' desativada.'); }
      }
      if (s1 === 'interface') {
        // config interface vlan <name> <id>  (simplificado)
        return ok('');
      }
      return ok('');
    }
    return err('% Comando WLC desconhecido. Use "?" para ajuda.');
  }
  function showWlanSummary(d) {
    let out = '\nWLAN ID  Profile / SSID            Status     Security      Interface\n';
    out += '-------  ------------------------  ---------  ------------  ----------\n';
    const ids = Object.keys(d.wlan.wlans);
    if (!ids.length) return out + '(nenhuma WLAN configurada)';
    ids.forEach((id) => {
      const w = d.wlan.wlans[id];
      const sec = w.security === 'wpa2-psk' ? (w.psk ? 'WPA2-PSK' : 'WPA2(s/chave)') : 'Open';
      out += pad(id, 9) + pad((w.profile || '') + ' / ' + w.ssid, 26) + pad(w.enabled ? 'Enabled' : 'Disabled', 11) + pad(sec, 14) + (w.iface || 'management') + '\n';
    });
    return out;
  }

  // ---- Automation host (ENSA) ----------------------------------------------
  // Pequeno shell que lê/edita um ficheiro de dados (JSON/YAML) e "corre" um script.
  function autoCommand(world, d, toks, line) {
    if (!d.auto) d.auto = { files: {}, data: {}, pushed: false };
    const a = d.auto;
    const cmd = toks[0].toLowerCase();
    if (cmd === 'ls') { return ok(Object.keys(a.files).join('  ') || '(vazio)'); }
    if (cmd === 'pwd') { return ok('/home/netops'); }
    if (cmd === 'clear') { return ok(''); }
    if (cmd === 'cat') {
      const f = toks[1];
      if (!a.files[f]) return err('cat: ' + (f || '') + ': ficheiro não encontrado');
      return ok(renderAutoFile(a, f));
    }
    if (cmd === 'get' || cmd === 'show-var') {
      // get <path>  -> mostra valor de uma chave
      const v = autoGet(a.data, toks[1]);
      return ok(toks[1] + ' = ' + JSON.stringify(v));
    }
    if (cmd === 'set') {
      // set <path> <value>
      const path = toks[1]; const valRaw = toks.slice(2).join(' ');
      let val = valRaw;
      if (/^-?\d+$/.test(valRaw)) val = parseInt(valRaw, 10);
      else if (valRaw === 'true' || valRaw === 'false') val = valRaw === 'true';
      autoSet(a.data, path, val);
      a.pushed = false;
      return ok('OK: ' + path + ' = ' + JSON.stringify(val));
    }
    if (cmd === 'curl') {
      // curl simulado a uma REST API do device
      const isGet = /-x\s*get/i.test(line) || !/-x/i.test(line);
      if (isGet) return ok(JSON.stringify(a.rest || { hostname: '?', interfaces: [] }, null, 2));
      // POST/PUT -> aplica
      return runAutoScript(world, d, a, 'rest');
    }
    if (cmd === 'python3' || cmd === 'python' || cmd === 'ansible-playbook') {
      return runAutoScript(world, d, a, cmd);
    }
    if (cmd === 'help' || cmd === '?') {
      return ok('Comandos: ls | cat <ficheiro> | get <chave> | set <chave> <valor> | python3 <script> | ansible-playbook <yml> | curl ...');
    }
    return err('comando não encontrado: ' + cmd);
  }
  function renderAutoFile(a, f) {
    const file = a.files[f];
    if (file.render) return file.render(a.data);
    if (file.type === 'json') return JSON.stringify(a.data, null, 2);
    return file.content || '';
  }
  function autoGet(obj, path) {
    return (path || '').split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }
  function autoSet(obj, path, val) {
    const ks = (path || '').split('.'); let o = obj;
    for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = {}; o = o[ks[i]]; }
    o[ks[ks.length - 1]] = val;
  }
  function runAutoScript(world, d, a, kind) {
    // A missão fornece um validador a.run(data) -> {ok, out}
    if (typeof a.run === 'function') {
      const r = a.run(a.data, world);
      if (r.ok) { a.pushed = true; if (r.apply) r.apply(world); }
      return ok(r.out);
    }
    return ok('(script executado)');
  }

  // ---- PC commands ---------------------------------------------------------
  function pcCommand(world, d, toks, line) {
    const cmd = toks[0].toLowerCase();
    if (cmd === 'ping') return ok(doPing(world, d, toks[1]));
    if (cmd === 'traceroute' || cmd === 'tracert') return ok(doTrace(world, d, toks[1]));
    if (cmd === 'ipconfig') return ok(ipconfig(d, /\/all/i.test(line)));
    if (cmd === 'arp') return ok('\nInternet Address      Physical Address      Type\n  ' + (d.gateway || '?') + '        00aa.00bb.00cc        dynamic');
    if (cmd === 'nslookup') return ok('Server:  ' + (d.dns || 'unknown') + '\nAddress: ' + (d.dns || '?'));
    return err('Unknown PC command: ' + cmd);
  }
  function ipconfig(d, all) {
    let out = '\n   IPv4 Address. . . . . . . . . . . : ' + (d.ip || '(none)') +
      '\n   Subnet Mask . . . . . . . . . . . : ' + (d.mask || '(none)') +
      '\n   Default Gateway . . . . . . . . . : ' + (d.gateway || '(none)');
    if (all) out += '\n   DNS Servers . . . . . . . . . . . : ' + (d.dns || '(none)');
    return out;
  }

  // ---- ping / traceroute (uses world.connectivity resolver) ---------------
  function doPing(world, d, target) {
    if (!target) return '% Incomplete command (ping <ip>)';
    const reachable = world.connectivity ? world.connectivity(world, d, target) : { ok: false, reason: 'no resolver' };
    if (reachable.ok) {
      return 'Pinging ' + target + ' with 32 bytes of data:\n' +
        'Reply from ' + target + ': bytes=32 time' + (reachable.time || '<1ms') + ' TTL=' + (reachable.ttl || 255) + '\n'.repeat(1) +
        'Reply from ' + target + ': bytes=32 time<1ms TTL=' + (reachable.ttl || 255) + '\n' +
        'Reply from ' + target + ': bytes=32 time<1ms TTL=' + (reachable.ttl || 255) + '\n' +
        'Reply from ' + target + ': bytes=32 time<1ms TTL=' + (reachable.ttl || 255) + '\n\n' +
        'Ping statistics for ' + target + ':\n    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)';
    }
    const msg = reachable.reason === 'unreachable-host' ? 'Destination host unreachable.' :
      reachable.reason === 'timeout' ? 'Request timed out.' :
        reachable.reason === 'net-unreachable' ? 'Reply from ' + (d.gateway || target) + ': Destination net unreachable.' :
          'Request timed out.';
    return 'Pinging ' + target + ' with 32 bytes of data:\n' + (msg + '\n').repeat(4) +
      '\nPing statistics for ' + target + ':\n    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss)';
  }
  function doTrace(world, d, target) {
    if (!target) return '% Incomplete command';
    const r = world.connectivity ? world.connectivity(world, d, target) : { ok: false };
    if (r.ok && r.path) {
      let out = '\nTracing route to ' + target + '\n\n';
      r.path.forEach((hop, idx) => { out += '  ' + (idx + 1) + '   <1 ms   ' + hop + '\n'; });
      out += '\nTrace complete.';
      return out;
    }
    let out = '\nTracing route to ' + target + '\n\n';
    if (r.partial) r.partial.forEach((hop, idx) => out += '  ' + (idx + 1) + '   <1 ms   ' + hop + '\n');
    out += '  ' + ((r.partial ? r.partial.length : 0) + 1) + '   *  *  *   Request timed out.\n\nTrace failed.';
    return out;
  }

  function helpText() {
    return 'Common: enable | configure terminal | interface <id> | show ... | ping <ip> | exit | end';
  }

  // ---- world ---------------------------------------------------------------
  function buildWorld(spec) {
    const world = { devices: {}, connectivity: spec.connectivity || null, meta: spec.meta || {} };
    (spec.devices || []).forEach((c) => { world.devices[c.id] = newDevice(c); });
    return world;
  }

  const API = {
    buildWorld, newDevice, execute, prompt, normIface, shortIface,
    sameSubnet, ipToInt, intToIp, netAddr, wildToMask, maskToPrefix, recompute,
    // expose renderers for tests
    _show: { showVlanBrief, showInterfacesTrunk, showIpRoute, showOspfNeighbor, showIpIntBrief },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.NOA_ENGINE = API;
})(typeof window !== 'undefined' ? window : globalThis);

/* ===== missions.js ===== */
/* ============================================================================
 * Network Ops Academy — Missions (missions.js)
 * Each mission = topology + seeded fault + objectives(validators) + connectivity.
 * Schema:
 *   { id, code, title, place, act, xp, badge, difficulty, concepts[],
 *     symptom, briefing, intel[], hints[], guided[], debrief,
 *     world(E) -> spec for E.buildWorld,
 *     objectives[] : { id, text, check(world)->bool },
 *     evaluate(world) (optional) : derive neighbors/routes/ping state,
 *     connectivity(world, src, target) : {ok, reason, path?, ttl?} }
 * ==========================================================================*/
(function (root) {
  'use strict';

  function build(E) {
    const norm = E.normIface, short = E.shortIface, sameNet = E.sameSubnet;
    const ip2 = E.ipToInt;

    // --- shared helpers ----------------------------------------------------
    function dev(w, id) { return w.devices[id]; }
    function iface(w, id, name) { return w.devices[id].interfaces[norm(name)]; }
    function portUp(i) { return i && i.status === 'up'; }

    // does an access port reach a server in same vlan on same switch
    function l2reach(sw, ipMap, srcIp, dstIp) {
      const srcPort = Object.values(sw.interfaces).find((i) => ipMap[i.name] === srcIp);
      const dstPort = Object.values(sw.interfaces).find((i) => ipMap[i.name] === dstIp);
      if (!srcPort || !dstPort) return false;
      return srcPort.status === 'up' && dstPort.status === 'up' &&
        srcPort.mode === 'access' && dstPort.mode === 'access' &&
        srcPort.accessVlan === dstPort.accessVlan;
    }

    // wildcard match: does srcIp fall in net/wild
    function wildMatch(srcIp, net, wild) {
      if (net === 'any') return true;
      if (!wild) wild = '0.0.0.0';
      const s = ip2(srcIp), n = ip2(net), w = ip2(wild);
      return ((s & ~w) >>> 0) === ((n & ~w) >>> 0);
    }
    // returns true if acl permits srcIp (standard) — append-only friendly: any permit wins,
    // evaluated before its position only matters when an earlier deny matches; we model
    // simple "first match" using rule order.
    function aclPermitsStd(acl, srcIp) {
      if (!acl) return true;
      for (const r of acl.rules) {
        if (wildMatch(srcIp, r.src, r.srcWild)) return r.action === 'permit';
      }
      return false; // implicit deny
    }

    const M = [];

    /* ===================== ACT I — SWITCHING (SRWE) ===================== */

    // ---- MISSION 1 : VLAN ------------------------------------------------
    M.push({
      id: 'm1', code: 'NOA-101', title: 'O Escritório Silencioso', place: 'Campus LAN', act: 'SRWE',
      xp: 150, badge: 'Iniciada em VLANs', difficulty: 1,
      concepts: ['VLAN', 'Domínio de broadcast', 'Access port'],
      symptom: 'A estação PC-CONTAB (Fa0/1) não acessa o servidor de arquivos. A vizinha PC-RH (Fa0/2) acessa normalmente.',
      briefing:
        'Bem-vinda à NetDefend. Seu primeiro chamado: o setor de Contabilidade está sem acesso ao servidor de ' +
        'arquivos FILE-SRV. Curiosamente, o RH — ligado ao MESMO switch — funciona. Dois hosts no mesmo switch ' +
        'só "se enxergam" na camada 2 se estiverem na MESMA VLAN. Descubra por que a Contabilidade ficou isolada.',
      intel: [
        'FILE-SRV = 192.168.10.50, na VLAN 10 (DADOS).',
        'PC-RH = 192.168.10.20 e fala com o servidor → logo a VLAN 10 funciona.',
        'PC-CONTAB = 192.168.10.10 e está mudo.',
      ],
      hints: [
        'Compare as portas: `show vlan brief` mostra qual porta está em qual VLAN.',
        'A porta Fa0/1 caiu na VLAN errada? VLANs diferentes = domínios de broadcast separados.',
        'Entre na interface e use `switchport access vlan 10`.',
      ],
      guided: ['show vlan brief', 'show interfaces status', 'configure terminal', 'interface fa0/1',
        'switchport mode access', 'switchport access vlan 10', 'end', 'show vlan brief'],
      debrief:
        'A porta Fa0/1 estava na VLAN 1 (default). Como as VLANs são domínios de broadcast isolados, o PC da ' +
        'Contabilidade vivia numa "ilha" diferente do servidor — daí o silêncio. Ao mover Fa0/1 para a VLAN 10, ' +
        'host e servidor voltaram ao mesmo domínio L2. Lição: num switch, conectividade L2 exige MESMA VLAN.',
      world() {
        return {
          devices: [
            {
              id: 'SW1', name: 'SW-CAMPUS', type: 'switch',
              vlans: [{ id: 10, name: 'DADOS' }, { id: 20, name: 'VOZ' }],
              interfaces: [
                { name: 'fa0/1', connected: true, adminUp: true, mode: 'access', accessVlan: 1, description: 'PC-CONTAB' }, // FAULT
                { name: 'fa0/2', connected: true, adminUp: true, mode: 'access', accessVlan: 10, description: 'PC-RH' },
                { name: 'fa0/5', connected: true, adminUp: true, mode: 'access', accessVlan: 10, description: 'FILE-SRV' },
                { name: 'gi0/1', connected: false, adminUp: false, mode: 'trunk' },
              ],
              macTable: [
                { vlan: 10, mac: '00d0.58a1.0010', port: 'Fa0/2' },
                { vlan: 10, mac: '00d0.58a1.0050', port: 'Fa0/5' },
                { vlan: 1, mac: '00d0.58a1.0001', port: 'Fa0/1' },
              ],
            },
            { id: 'PC-CONTAB', name: 'PC-CONTAB', type: 'pc', ip: '192.168.10.10', mask: '255.255.255.0', gateway: '192.168.10.1' },
            { id: 'PC-RH', name: 'PC-RH', type: 'pc', ip: '192.168.10.20', mask: '255.255.255.0', gateway: '192.168.10.1' },
            { id: 'FILE-SRV', name: 'FILE-SRV', type: 'server', ip: '192.168.10.50', mask: '255.255.255.0' },
          ],
        };
      },
      objectives: [
        { id: 'o1', text: 'Identificar em que VLAN está a porta Fa0/1', check: () => true, auto: 'inspect' },
        { id: 'o2', text: 'Colocar Fa0/1 na VLAN 10 (DADOS)', check: (w) => iface(w, 'SW1', 'fa0/1').accessVlan === 10 },
        { id: 'o3', text: 'Garantir que Fa0/1 está ativa (up)', check: (w) => iface(w, 'SW1', 'fa0/1').status === 'up' },
        { id: 'o4', text: 'Validar com ping de PC-CONTAB para 192.168.10.50', check: (w) => w._pinged && w._pinged['PC-CONTAB->192.168.10.50'] },
      ],
      topology: { nodes: [{ id: 'SW1', label: 'SW-CAMPUS', t: 'switch', x: 50, y: 18 }, { id: 'PC-CONTAB', label: 'PC-CONTAB', t: 'pc', x: 18, y: 70 }, { id: 'PC-RH', label: 'PC-RH', t: 'pc', x: 50, y: 78 }, { id: 'FILE-SRV', label: 'FILE-SRV', t: 'server', x: 82, y: 70 }], links: [{ a: 'SW1', b: 'PC-CONTAB', l: 'Fa0/1', fault: true }, { a: 'SW1', b: 'PC-RH', l: 'Fa0/2' }, { a: 'SW1', b: 'FILE-SRV', l: 'Fa0/5' }] },
      connectivity(w, src, target) {
        const ipMap = { 'Fa0/1': '192.168.10.10', 'FastEthernet0/1': '192.168.10.10', 'Fa0/2': '192.168.10.20', 'FastEthernet0/2': '192.168.10.20', 'Fa0/5': '192.168.10.50', 'FastEthernet0/5': '192.168.10.50' };
        const sw = dev(w, 'SW1');
        const okL2 = l2reach(sw, ipMap, src.ip, target);
        return okL2 ? { ok: true, ttl: 128 } : { ok: false, reason: 'timeout' };
      },
    });

    // ---- MISSION 2 : TRUNK ----------------------------------------------
    M.push({
      id: 'm2', code: 'NOA-102', title: 'A Ponte Quebrada', place: 'Campus LAN', act: 'SRWE',
      xp: 180, badge: 'Domadora de Trunks', difficulty: 2,
      concepts: ['Trunk 802.1Q', 'Native VLAN', 'VLANs entre switches'],
      symptom: 'Hosts da VLAN 10 no SW-A não falam com hosts da VLAN 10 no SW-B. Dentro de cada switch tudo funciona.',
      briefing:
        'Dois switches de andar (SW-A e SW-B) são interligados por um único uplink que deveria transportar VÁRIAS ' +
        'VLANs. Esse tipo de enlace chama-se TRUNK (802.1Q) e marca cada quadro com uma "tag" de VLAN. Se o uplink ' +
        'não estiver em modo trunk dos dois lados, as VLANs não atravessam a ponte. A VLAN 10 ficou partida ao meio.',
      intel: [
        'Uplink: SW-A Gi0/1  <—>  SW-B Gi0/1.',
        'PC-A1 (VLAN10, SW-A) deveria pingar PC-B1 (VLAN10, SW-B).',
        'Um lado do enlace pode estar como ACCESS em vez de TRUNK.',
      ],
      hints: [
        '`show interfaces trunk` em cada switch: o uplink aparece como trunk dos DOIS lados?',
        'Se um lado mostra "access", o tronco não se forma. Padronize ambos como trunk.',
        'Na interface do uplink: `switchport mode trunk` (e confirme a native vlan igual nos dois lados).',
      ],
      guided: ['show interfaces trunk', 'configure terminal', 'interface gi0/1', 'switchport mode trunk', 'end', 'show interfaces trunk'],
      debrief:
        'O Gi0/1 do SW-B estava em modo ACCESS (VLAN 1). Quadros da VLAN 10 chegavam tagueados do SW-A e eram ' +
        'descartados, porque uma porta access só entende UMA VLAN sem tag. Ao mudar SW-B Gi0/1 para trunk, o 802.1Q ' +
        'passou a transportar todas as VLANs. Sempre cheque os DOIS lados — e a Native VLAN deve bater.',
      world() {
        const mk = (id, name, upMode) => ({
          id, name, type: 'switch', vlans: [{ id: 10, name: 'DADOS' }, { id: 20, name: 'VOZ' }],
          interfaces: [
            { name: 'gi0/1', connected: true, adminUp: true, mode: upMode, accessVlan: upMode === 'access' ? 1 : 1, nativeVlan: 1, description: 'UPLINK' },
            { name: 'fa0/1', connected: true, adminUp: true, mode: 'access', accessVlan: 10, description: 'PC-' + name },
          ],
        });
        return {
          devices: [
            mk('SW-A', 'A1', 'trunk'),
            mk('SW-B', 'B1', 'access'), // FAULT
            { id: 'PC-A1', name: 'PC-A1', type: 'pc', ip: '192.168.10.11', mask: '255.255.255.0', gateway: '192.168.10.1' },
            { id: 'PC-B1', name: 'PC-B1', type: 'pc', ip: '192.168.10.21', mask: '255.255.255.0', gateway: '192.168.10.1' },
          ],
        };
      },
      objectives: [
        { id: 'o1', text: 'Confirmar que o uplink não está como trunk nos dois lados', check: () => true, auto: 'inspect' },
        { id: 'o2', text: 'Colocar o uplink do SW-B (Gi0/1) em modo trunk', check: (w) => iface(w, 'SW-B', 'gi0/1').mode === 'trunk' },
        { id: 'o3', text: 'Garantir Native VLAN idêntica nos dois lados', check: (w) => iface(w, 'SW-A', 'gi0/1').nativeVlan === iface(w, 'SW-B', 'gi0/1').nativeVlan },
        { id: 'o4', text: 'Validar ping de PC-A1 para PC-B1 (192.168.10.21)', check: (w) => w._pinged && w._pinged['PC-A1->192.168.10.21'] },
      ],
      topology: { nodes: [{ id: 'SW-A', label: 'SW-A', t: 'switch', x: 30, y: 25 }, { id: 'SW-B', label: 'SW-B', t: 'switch', x: 70, y: 25 }, { id: 'PC-A1', label: 'PC-A1', t: 'pc', x: 18, y: 75 }, { id: 'PC-B1', label: 'PC-B1', t: 'pc', x: 82, y: 75 }], links: [{ a: 'SW-A', b: 'SW-B', l: 'Gi0/1 trunk', fault: true }, { a: 'SW-A', b: 'PC-A1', l: 'Fa0/1' }, { a: 'SW-B', b: 'PC-B1', l: 'Fa0/1' }] },
      connectivity(w) {
        const a = iface(w, 'SW-A', 'gi0/1'), b = iface(w, 'SW-B', 'gi0/1');
        const trunkOk = a.mode === 'trunk' && b.mode === 'trunk' && a.status === 'up' && b.status === 'up' && a.nativeVlan === b.nativeVlan;
        return trunkOk ? { ok: true, ttl: 128 } : { ok: false, reason: 'timeout' };
      },
    });

    // ---- MISSION 3 : INTER-VLAN ROUTING ---------------------------------
    M.push({
      id: 'm3', code: 'NOA-103', title: 'As Duas Ilhas', place: 'Campus LAN', act: 'SRWE',
      xp: 220, badge: 'Roteadora de VLANs', difficulty: 3,
      concepts: ['Inter-VLAN Routing', 'Router-on-a-Stick', 'Subinterfaces', 'encapsulation dot1Q'],
      symptom: 'VLAN 10 (Vendas) conversa entre si, mas não alcança a VLAN 20 (TI). VLAN 20 não tem gateway.',
      briefing:
        'VLANs isolam o tráfego — ótimo para segurança, ruim quando precisam conversar. Para rotear ENTRE VLANs ' +
        'usamos um roteador com SUBINTERFACES (router-on-a-stick): uma subinterface por VLAN, cada uma com ' +
        '`encapsulation dot1Q <vlan>` e o IP que será o gateway daquela VLAN. A subinterface da VLAN 20 sumiu.',
      intel: [
        'R-COR Gi0/0 é trunk para o switch. Gateways: VLAN10 = 192.168.10.1, VLAN20 = 192.168.20.1.',
        'Gi0/0.10 existe e funciona. PC da VLAN 20 está sem gateway.',
        'Falta criar a subinterface Gi0/0.20 com encapsulation dot1Q 20 e IP 192.168.20.1.',
      ],
      hints: [
        '`show ip interface brief` / `show running-config`: existe Gi0/0.20?',
        'Crie a subinterface: `interface gi0/0.20`.',
        'Dentro dela: `encapsulation dot1Q 20` e depois `ip address 192.168.20.1 255.255.255.0`.',
      ],
      guided: ['show running-config', 'configure terminal', 'interface gi0/0.20', 'encapsulation dot1Q 20', 'ip address 192.168.20.1 255.255.255.0', 'end', 'show ip interface brief'],
      debrief:
        'A subinterface Gi0/0.20 não existia, então a VLAN 20 não tinha gateway nenhum — qualquer pacote para fora ' +
        'da própria sub-rede morria. Criando Gi0/0.20 com encapsulation dot1Q 20 e o IP .1, o roteador passou a ' +
        'receber/etiquetar quadros da VLAN 20 e a rotear entre as duas ilhas. Uma subinterface por VLAN é a regra.',
      world() {
        return {
          devices: [
            {
              id: 'R-COR', name: 'R-COR', type: 'router', ipRouting: true,
              interfaces: [
                { name: 'gi0/0', connected: true, adminUp: true, isSwitchport: false, description: 'TRUNK p/ switch' },
                { name: 'gi0/0.10', connected: true, adminUp: true, isSwitchport: false, ip: '192.168.10.1', mask: '255.255.255.0', parent: 'GigabitEthernet0/0', encap: { dot1q: 10, native: false } },
                // FAULT: gi0/0.20 ausente
              ],
            },
            { id: 'SW1', name: 'SW-ACC', type: 'switch', vlans: [{ id: 10, name: 'VENDAS' }, { id: 20, name: 'TI' }], interfaces: [{ name: 'gi0/1', connected: true, adminUp: true, mode: 'trunk' }, { name: 'fa0/1', connected: true, adminUp: true, mode: 'access', accessVlan: 10 }, { name: 'fa0/2', connected: true, adminUp: true, mode: 'access', accessVlan: 20 }] },
            { id: 'PC-V', name: 'PC-VENDAS', type: 'pc', ip: '192.168.10.10', mask: '255.255.255.0', gateway: '192.168.10.1' },
            { id: 'PC-TI', name: 'PC-TI', type: 'pc', ip: '192.168.20.10', mask: '255.255.255.0', gateway: '192.168.20.1' },
          ],
        };
      },
      objectives: [
        { id: 'o1', text: 'Criar a subinterface Gi0/0.20 no R-COR', check: (w) => !!iface(w, 'R-COR', 'gi0/0.20') },
        { id: 'o2', text: 'Aplicar encapsulation dot1Q 20 na subinterface', check: (w) => { const i = iface(w, 'R-COR', 'gi0/0.20'); return i && i.encap && i.encap.dot1q === 20; } },
        { id: 'o3', text: 'Definir o gateway 192.168.20.1/24 na subinterface', check: (w) => { const i = iface(w, 'R-COR', 'gi0/0.20'); return i && i.ip === '192.168.20.1' && i.mask === '255.255.255.0'; } },
        { id: 'o4', text: 'Validar ping de PC-TI para PC-VENDAS (192.168.10.10)', check: (w) => w._pinged && w._pinged['PC-TI->192.168.10.10'] },
      ],
      topology: { nodes: [{ id: 'R-COR', label: 'R-COR', t: 'router', x: 50, y: 14 }, { id: 'SW1', label: 'SW-ACC', t: 'switch', x: 50, y: 45 }, { id: 'PC-V', label: 'PC-VENDAS', t: 'pc', x: 25, y: 80 }, { id: 'PC-TI', label: 'PC-TI', t: 'pc', x: 75, y: 80 }], links: [{ a: 'R-COR', b: 'SW1', l: 'Gi0/0 trunk', fault: true }, { a: 'SW1', b: 'PC-V', l: 'Fa0/1 v10' }, { a: 'SW1', b: 'PC-TI', l: 'Fa0/2 v20' }] },
      connectivity(w, src, target) {
        const sub10 = iface(w, 'R-COR', 'gi0/0.10'), sub20 = iface(w, 'R-COR', 'gi0/0.20');
        const ok10 = sub10 && sub10.ip === '192.168.10.1';
        const ok20 = sub20 && sub20.encap && sub20.encap.dot1q === 20 && sub20.ip === '192.168.20.1';
        if (target === '192.168.10.10' && src.id === 'PC-TI') return (ok10 && ok20) ? { ok: true, ttl: 127, path: ['192.168.20.1', '192.168.10.10'] } : { ok: false, reason: 'net-unreachable' };
        if (target === '192.168.20.10' && src.id === 'PC-V') return (ok10 && ok20) ? { ok: true, ttl: 127 } : { ok: false, reason: 'net-unreachable' };
        return { ok: false, reason: 'timeout' };
      },
    });

    // ---- MISSION 4 : STP ------------------------------------------------
    M.push({
      id: 'm4', code: 'NOA-104', title: 'A Tempestade de Broadcast', place: 'Campus LAN', act: 'SRWE',
      xp: 240, badge: 'Guardiã do STP', difficulty: 3,
      concepts: ['STP / RSTP', 'Root Bridge', 'Eleição de raiz', 'Prioridade'],
      symptom: 'A rede fica lenta e instável em horários de pico. O switch eleito como raiz do STP é um switch de borda fraco.',
      briefing:
        'Existem três switches em anel (redundância). O STP escolhe UMA Root Bridge e bloqueia portas redundantes ' +
        'para evitar loops. Por padrão, vence quem tem menor Bridge ID — e acabou ganhando o SW-ACC (borda), o que ' +
        'força o tráfego por caminhos ruins e gera reconvergências. A raiz DEVE ser o switch de núcleo SW-CORE.',
      intel: [
        'SW-CORE (núcleo), SW-DIST e SW-ACC formam um triângulo.',
        'Hoje a raiz é o SW-ACC (prioridade default 32769). Isso é um problema de design.',
        'Force o SW-CORE a ser raiz da VLAN 1 com menor prioridade.',
      ],
      hints: [
        '`show spanning-tree vlan 1`: veja quem é a Root Bridge atual.',
        'No SW-CORE, defina prioridade menor para vencer a eleição.',
        '`spanning-tree vlan 1 root primary` (ou `priority 24576`) no SW-CORE.',
      ],
      guided: ['show spanning-tree', 'configure terminal', 'spanning-tree vlan 1 root primary', 'end', 'show spanning-tree'],
      debrief:
        'O switch de acesso virou raiz por ter, por acaso, o menor Bridge ID. Definindo o SW-CORE como raiz ' +
        '(prioridade 24576), o STP recalculou a topologia: caminhos curtos passaram a forwarding e os redundantes a ' +
        'blocking de forma previsível. Regra de ouro: a Root Bridge deve ser escolhida por projeto, no núcleo.',
      world() {
        return {
          devices: [
            { id: 'SW-CORE', name: 'SW-CORE', type: 'switch', stp: { vlans: [1], rootFor: [], priority: 32768, bridgeMac: '00c0.0001.0001', rootPriority: 32769, rootMac: '00ac.00cc.0003', proto: 'rstp', ports: [{ iface: 'Gi0/1', role: 'Root', sts: 'FWD', cost: 4 }, { iface: 'Gi0/2', role: 'Altn', sts: 'BLK', cost: 4 }] } },
            { id: 'SW-DIST', name: 'SW-DIST', type: 'switch', stp: { vlans: [1], rootFor: [], priority: 32768, bridgeMac: '00c0.0002.0002', proto: 'rstp', ports: [{ iface: 'Gi0/1', role: 'Root', sts: 'FWD' }, { iface: 'Gi0/2', role: 'Desg', sts: 'FWD' }] } },
            { id: 'SW-ACC', name: 'SW-ACC', type: 'switch', stp: { vlans: [1], rootFor: [1], priority: 32768, bridgeMac: '00ac.00cc.0003', proto: 'rstp', ports: [{ iface: 'Gi0/1', role: 'Desg', sts: 'FWD' }, { iface: 'Gi0/2', role: 'Desg', sts: 'FWD' }] } },
          ],
        };
      },
      // when SW-CORE becomes root, fix its stp render + clear SW-ACC
      evaluate(w) {
        const core = dev(w, 'SW-CORE');
        const acc = dev(w, 'SW-ACC');
        const coreIsRoot = core.stp && (core.stp.rootFor || []).includes(1) && (core.stp.priority || 32768) <= 24576;
        if (coreIsRoot) {
          acc.stp.rootFor = [];
          acc.stp.ports = [{ iface: 'Gi0/1', role: 'Root', sts: 'FWD', cost: 4 }, { iface: 'Gi0/2', role: 'Altn', sts: 'BLK', cost: 4 }];
          core.stp.ports = [{ iface: 'Gi0/1', role: 'Desg', sts: 'FWD', cost: 4 }, { iface: 'Gi0/2', role: 'Desg', sts: 'FWD', cost: 4 }];
          w._stable = true;
        }
      },
      objectives: [
        { id: 'o1', text: 'Identificar a Root Bridge atual (SW-ACC)', check: () => true, auto: 'inspect' },
        { id: 'o2', text: 'Tornar o SW-CORE a Root Bridge da VLAN 1', check: (w) => { const s = dev(w, 'SW-CORE').stp; return s && (s.rootFor || []).includes(1) && (s.priority || 32768) <= 24576; } },
        { id: 'o3', text: 'Confirmar topologia estável (SW-ACC deixou de ser raiz)', check: (w) => !!w._stable },
      ],
      topology: { nodes: [{ id: 'SW-CORE', label: 'SW-CORE', t: 'switch', x: 50, y: 16 }, { id: 'SW-DIST', label: 'SW-DIST', t: 'switch', x: 24, y: 70 }, { id: 'SW-ACC', label: 'SW-ACC ★raiz', t: 'switch', x: 76, y: 70 }], links: [{ a: 'SW-CORE', b: 'SW-DIST', l: 'Gi0/1' }, { a: 'SW-CORE', b: 'SW-ACC', l: 'Gi0/2', fault: true }, { a: 'SW-DIST', b: 'SW-ACC', l: 'Gi0/2' }] },
      connectivity() { return { ok: true, ttl: 128 }; },
    });

    // ---- MISSION 5 : ETHERCHANNEL ---------------------------------------
    M.push({
      id: 'm5', code: 'NOA-105', title: 'O Cabo Vermelho', place: 'Data Center', act: 'SRWE',
      xp: 240, badge: 'Engenheira de EtherChannel', difficulty: 3,
      concepts: ['EtherChannel', 'LACP (active/passive)', 'PAgP', 'Mismatch de modo'],
      symptom: 'O agrupamento de dois links entre SW-1 e SW-2 não sobe. O Port-channel aparece como "SD" (down).',
      briefing:
        'Para somar largura de banda e ter redundância, dois links viram UM lógico: o EtherChannel. Mas os modos ' +
        'precisam ser compatíveis. Com LACP, os lados podem ser active/active, ou active/passive — NUNCA ' +
        'passive/passive. E "on" só forma canal com "on" do outro lado. Alguém misturou os modos.',
      intel: [
        'SW-1 Gi0/1-0/2: channel-group 1 mode active (LACP).',
        'SW-2 Gi0/1-0/2: channel-group 1 mode on (estático). → INCOMPATÍVEL.',
        'Padronize ambos em LACP active para o canal subir.',
      ],
      hints: [
        '`show etherchannel summary`: o Po1 aparece como (SD)? Olhe os flags dos membros.',
        'LACP "active" não conversa com modo "on". Alinhe os modos.',
        'No SW-2: nas Gi0/1 e Gi0/2 use `channel-group 1 mode active`.',
      ],
      guided: ['show etherchannel summary', 'configure terminal', 'interface gi0/1', 'channel-group 1 mode active', 'interface gi0/2', 'channel-group 1 mode active', 'end', 'show etherchannel summary'],
      debrief:
        'O SW-1 falava LACP (active) e o SW-2 estava em "on" (canal estático, sem negociação). Modos incompatíveis ' +
        'deixam os membros em standalone (I) e o Po1 em down (SD). Ao colocar os dois lados em LACP active, o ' +
        'protocolo negociou e agrupou os links (P / SU). Regra: combine active/active ou active/passive — nunca on/LACP.',
      world() {
        const mk = (id, name, mode) => ({
          id, name, type: 'switch', vlans: [{ id: 10, name: 'SRV' }],
          interfaces: [
            { name: 'gi0/1', connected: true, adminUp: true, mode: 'trunk', channelGroup: { id: 1, mode } },
            { name: 'gi0/2', connected: true, adminUp: true, mode: 'trunk', channelGroup: { id: 1, mode } },
          ],
        });
        return { devices: [mk('SW-1', 'SW-1', 'active'), mk('SW-2', 'SW-2', 'on')] };
      },
      objectives: [
        { id: 'o1', text: 'Diagnosticar o mismatch de modos no Po1', check: () => true, auto: 'inspect' },
        { id: 'o2', text: 'Colocar SW-2 Gi0/1 em LACP active', check: (w) => { const i = iface(w, 'SW-2', 'gi0/1'); return i.channelGroup && i.channelGroup.mode === 'active'; } },
        { id: 'o3', text: 'Colocar SW-2 Gi0/2 em LACP active', check: (w) => { const i = iface(w, 'SW-2', 'gi0/2'); return i.channelGroup && i.channelGroup.mode === 'active'; } },
        { id: 'o4', text: 'Po1 agrupado nos dois lados (LACP compatível)', check: (w) => { const ok = (id) => ['gi0/1', 'gi0/2'].every((n) => { const c = iface(w, id, n).channelGroup; return c && (c.mode === 'active' || c.mode === 'passive'); }) && !['gi0/1', 'gi0/2'].every((n) => iface(w, id, n).channelGroup.mode === 'passive'); return ok('SW-1') && ok('SW-2'); } },
      ],
      topology: { nodes: [{ id: 'SW-1', label: 'SW-1', t: 'switch', x: 30, y: 30 }, { id: 'SW-2', label: 'SW-2', t: 'switch', x: 70, y: 30 }], links: [{ a: 'SW-1', b: 'SW-2', l: 'Gi0/1', fault: true }, { a: 'SW-1', b: 'SW-2', l: 'Gi0/2', fault: true }] },
      connectivity() { return { ok: true, ttl: 128 }; },
    });

    // ---- MISSION 6 : PORT SECURITY --------------------------------------
    M.push({
      id: 'm6', code: 'NOA-106', title: 'O Intruso', place: 'SOC', act: 'SRWE',
      xp: 260, badge: 'Sentinela de Portas', difficulty: 3,
      concepts: ['Port Security', 'Sticky MAC', 'Violation modes', 'err-disabled'],
      symptom: 'Um notebook não autorizado foi plugado na sala de reunião. A porta Fa0/1 entrou em err-disabled.',
      briefing:
        'O SOC detectou um dispositivo desconhecido na porta Fa0/1. A Port Security limita quais MACs podem usar uma ' +
        'porta. A porta caiu em err-disabled por violação. Sua missão: reativar o acesso do equipamento legítimo e ' +
        'reforçar a segurança — máximo 1 MAC, aprendizado sticky e modo de violação "restrict" (loga sem derrubar).',
      intel: [
        'Fa0/1 está secure-shutdown após um MAC estranho aparecer.',
        'Política desejada: máximo 1 endereço, sticky, violação = restrict.',
        'Depois de configurar, é preciso reativar a porta (shutdown/no shutdown).',
      ],
      hints: [
        '`show port-security interface fa0/1`: veja o status e a contagem de violação.',
        'Configure: `switchport port-security`, `maximum 1`, `mac-address sticky`, `violation restrict`.',
        'Recupere a porta: `shutdown` seguido de `no shutdown` em Fa0/1.',
      ],
      guided: ['show port-security interface fa0/1', 'configure terminal', 'interface fa0/1', 'switchport mode access', 'switchport port-security', 'switchport port-security maximum 1', 'switchport port-security mac-address sticky', 'switchport port-security violation restrict', 'shutdown', 'no shutdown', 'end', 'show port-security'],
      debrief:
        'A porta estava bloqueada (err-disabled) porque a violação default é "shutdown". Reconfigurando com sticky + ' +
        'maximum 1 + violation restrict, a porta passa a aprender e fixar o MAC legítimo e, em vez de cair, apenas ' +
        'registra e descarta o tráfego de intrusos. Recuperar de err-disabled exige um ciclo shutdown/no shutdown.',
      world() {
        return {
          devices: [
            {
              id: 'SW1', name: 'SW-REUNIAO', type: 'switch', vlans: [{ id: 10, name: 'CORP' }],
              interfaces: [
                { name: 'fa0/1', connected: true, adminUp: true, mode: 'access', accessVlan: 10, portSecurity: { enabled: true, max: 1, violation: 'shutdown', sticky: false, macs: ['0011.2233.4455'], violations: 3, violated: true, lastSrc: '00de.adbe.ef00' } },
              ],
              macTable: [{ vlan: 10, mac: '0011.2233.4455', port: 'Fa0/1', type: 'STATIC' }],
            },
            { id: 'PC-OK', name: 'NB-CORP', type: 'pc', ip: '192.168.50.10', mask: '255.255.255.0', gateway: '192.168.50.1' },
          ],
        };
      },
      evaluate(w) {
        const i = iface(w, 'SW1', 'fa0/1');
        if (i.portSecurity && i.portSecurity.enabled && i.portSecurity.violation === 'restrict' && i.adminUp) {
          i.portSecurity.violated = false; i.portSecurity.violations = 0;
        }
      },
      objectives: [
        { id: 'o1', text: 'Diagnosticar a violação de Port Security em Fa0/1', check: () => true, auto: 'inspect' },
        { id: 'o2', text: 'Definir máximo de 1 MAC e aprendizado sticky', check: (w) => { const p = iface(w, 'SW1', 'fa0/1').portSecurity; return p && p.enabled && p.max === 1 && p.sticky; } },
        { id: 'o3', text: 'Definir modo de violação como restrict', check: (w) => { const p = iface(w, 'SW1', 'fa0/1').portSecurity; return p && p.violation === 'restrict'; } },
        { id: 'o4', text: 'Recuperar a porta para o estado up', check: (w) => iface(w, 'SW1', 'fa0/1').status === 'up' && !iface(w, 'SW1', 'fa0/1').portSecurity.violated },
      ],
      topology: { nodes: [{ id: 'SW1', label: 'SW-REUNIAO', t: 'switch', x: 50, y: 22 }, { id: 'PC-OK', label: 'NB-CORP', t: 'pc', x: 35, y: 75 }, { id: 'INTRUDER', label: '⚠ INTRUSO', t: 'pc', x: 70, y: 75 }], links: [{ a: 'SW1', b: 'PC-OK', l: 'Fa0/1' }, { a: 'SW1', b: 'INTRUDER', l: 'Fa0/1 ✗', fault: true }] },
      connectivity() { return { ok: true, ttl: 128 }; },
    });

    /* ===================== ACT II — ROUTING (ENSA) ===================== */

    // ---- MISSION 7 : OSPF -----------------------------------------------
    M.push({
      id: 'm7', code: 'NOA-201', title: 'A Filial Perdida', place: 'Filial Norte', act: 'ENSA',
      xp: 300, badge: 'Vizinha do OSPF', difficulty: 4,
      concepts: ['OSPF', 'Adjacências', 'Área 0', 'network statement'],
      symptom: 'A LAN da Filial Norte sumiu da tabela de roteamento da Matriz. R-HQ e R-NORTE não formam adjacência OSPF.',
      briefing:
        'A Matriz (R-HQ) e a Filial Norte (R-NORTE) rodam OSPF na área 0. Para trocar rotas, eles precisam ser ' +
        'VIZINHOS (adjacência FULL) no enlace que os conecta — e isso só acontece se AMBOS anunciarem a rede do ' +
        'enlace no OSPF. O R-NORTE não está anunciando a rede do link, então a adjacência nunca sobe.',
      intel: [
        'Enlace HQ–NORTE: 10.0.0.0/30 (HQ .1, NORTE .2). LAN da filial: 192.168.20.0/24.',
        'R-HQ anuncia o enlace e sua LAN. R-NORTE só anuncia a LAN — falta o `network` do enlace.',
        '`show ip ospf neighbor` no R-HQ vem vazio → sem vizinho.',
      ],
      hints: [
        '`show ip ospf neighbor` (vazio) e `show ip protocols` para ver as redes anunciadas.',
        'No R-NORTE falta anunciar a rede do enlace 10.0.0.0/0.0.0.3 na área 0.',
        'No `router ospf 1`: `network 10.0.0.0 0.0.0.3 area 0`.',
      ],
      guided: ['show ip ospf neighbor', 'show ip protocols', 'configure terminal', 'router ospf 1', 'network 10.0.0.0 0.0.0.3 area 0', 'end', 'show ip ospf neighbor', 'show ip route'],
      debrief:
        'Sem o `network` do enlace, o OSPF do R-NORTE nem enviava hellos pela interface do link, então nunca houve ' +
        'vizinhança — e sem vizinho, nenhuma rota é trocada. Anunciando 10.0.0.0/0.0.0.3 na área 0, a adjacência ' +
        'subiu para FULL e a LAN 192.168.20.0/24 apareceu como rota "O" na Matriz. OSPF: anuncie TODOS os enlaces.',
      world() {
        return {
          devices: [
            {
              id: 'R-HQ', name: 'R-HQ', type: 'router', ipRouting: true,
              interfaces: [
                { name: 'gi0/0', connected: true, adminUp: true, isSwitchport: false, ip: '192.168.1.1', mask: '255.255.255.0', description: 'LAN-MATRIZ' },
                { name: 'gi0/1', connected: true, adminUp: true, isSwitchport: false, ip: '10.0.0.1', mask: '255.255.255.252', description: 'WAN p/ NORTE' },
              ],
              ospf: { pid: 1, routerId: '1.1.1.1', networks: [{ net: '192.168.1.0', wild: '0.0.0.255', area: 0 }, { net: '10.0.0.0', wild: '0.0.0.3', area: 0 }], passive: [] },
            },
            {
              id: 'R-NORTE', name: 'R-NORTE', type: 'router', ipRouting: true,
              interfaces: [
                { name: 'gi0/0', connected: true, adminUp: true, isSwitchport: false, ip: '192.168.20.1', mask: '255.255.255.0', description: 'LAN-NORTE' },
                { name: 'gi0/1', connected: true, adminUp: true, isSwitchport: false, ip: '10.0.0.2', mask: '255.255.255.252', description: 'WAN p/ HQ' },
              ],
              ospf: { pid: 1, routerId: '2.2.2.2', networks: [{ net: '192.168.20.0', wild: '0.0.0.255', area: 0 }], passive: [] }, // FAULT: falta enlace
            },
            { id: 'PC-HQ', name: 'PC-HQ', type: 'pc', ip: '192.168.1.10', mask: '255.255.255.0', gateway: '192.168.1.1' },
            { id: 'PC-N', name: 'PC-NORTE', type: 'pc', ip: '192.168.20.10', mask: '255.255.255.0', gateway: '192.168.20.1' },
          ],
        };
      },
      evaluate(w) {
        const hq = dev(w, 'R-HQ'), no = dev(w, 'R-NORTE');
        const advertises = (r, net) => (r.ospf.networks || []).some((n) => E.netAddr(net, '255.255.255.252') === E.netAddr(n.net, E.wildToMask(n.wild)) || n.net === '10.0.0.0');
        const adj = advertises(hq, '10.0.0.0') && advertises(no, '10.0.0.0');
        if (adj) {
          hq.meta.ospfNeighbors = [{ id: '2.2.2.2', state: 'FULL/BDR', address: '10.0.0.2', iface: 'Gi0/1' }];
          no.meta.ospfNeighbors = [{ id: '1.1.1.1', state: 'FULL/DR', address: '10.0.0.1', iface: 'Gi0/1' }];
          hq.meta.learnedRoutes = [{ kind: 'O', net: '192.168.20.0', mask: '255.255.255.0', nh: '10.0.0.2', iface: 'Gi0/1', metric: 2 }];
          no.meta.learnedRoutes = [{ kind: 'O', net: '192.168.1.0', mask: '255.255.255.0', nh: '10.0.0.1', iface: 'Gi0/1', metric: 2 }];
          w._adj = true;
        } else {
          hq.meta.ospfNeighbors = []; no.meta.ospfNeighbors = [];
          hq.meta.learnedRoutes = []; no.meta.learnedRoutes = [];
          w._adj = false;
        }
      },
      objectives: [
        { id: 'o1', text: 'Constatar que não há vizinho OSPF no R-HQ', check: () => true, auto: 'inspect' },
        { id: 'o2', text: 'Anunciar a rede do enlace 10.0.0.0/30 na área 0 no R-NORTE', check: (w) => (dev(w, 'R-NORTE').ospf.networks || []).some((n) => n.net === '10.0.0.0' && n.area === 0) },
        { id: 'o3', text: 'Formar adjacência FULL entre R-HQ e R-NORTE', check: (w) => !!w._adj },
        { id: 'o4', text: 'Validar ping de PC-HQ para PC-NORTE (192.168.20.10)', check: (w) => w._pinged && w._pinged['PC-HQ->192.168.20.10'] },
      ],
      topology: { nodes: [{ id: 'R-HQ', label: 'R-HQ', t: 'router', x: 28, y: 30 }, { id: 'R-NORTE', label: 'R-NORTE', t: 'router', x: 72, y: 30 }, { id: 'PC-HQ', label: 'PC-HQ', t: 'pc', x: 14, y: 78 }, { id: 'PC-N', label: 'PC-NORTE', t: 'pc', x: 86, y: 78 }], links: [{ a: 'R-HQ', b: 'R-NORTE', l: '10.0.0.0/30', fault: true }, { a: 'R-HQ', b: 'PC-HQ', l: 'LAN' }, { a: 'R-NORTE', b: 'PC-N', l: 'LAN' }] },
      connectivity(w, src, target) {
        if (!w._adj) return { ok: false, reason: 'net-unreachable' };
        return { ok: true, ttl: 126, path: [src.gateway, '10.0.0.2', target] };
      },
    });

    // ---- MISSION 8 : NAT/PAT --------------------------------------------
    M.push({
      id: 'm8', code: 'NOA-202', title: 'A Internet Desapareceu', place: 'ISP', act: 'ENSA',
      xp: 300, badge: 'Tradutora de NAT', difficulty: 4,
      concepts: ['NAT', 'PAT (overload)', 'ip nat inside/outside'],
      symptom: 'A LAN inteira perdeu a internet. O ping para 8.8.8.8 falha. A rota default existe e a WAN está up.',
      briefing:
        'A LAN usa IPs privados (192.168.10.0/24) que NÃO são roteáveis na internet. O R-BORDA faz PAT (NAT overload) ' +
        'traduzindo todos para o IP público da WAN. Há ACL e a regra de NAT… mas o NAT só funciona se o roteador ' +
        'souber qual interface é "inside" (LAN) e qual é "outside" (internet). Uma dessas marcações sumiu.',
      intel: [
        'Gi0/0 = LAN (inside, 192.168.10.1). Gi0/1 = WAN pública (deveria ser outside).',
        'access-list 1 permit 192.168.10.0 0.0.0.255 e `ip nat inside source list 1 interface Gi0/1 overload` existem.',
        'Falta marcar a WAN Gi0/1 como `ip nat outside`.',
      ],
      hints: [
        '`show ip nat translations` está vazio mesmo com tráfego? Cheque inside/outside.',
        '`show running-config` em Gi0/1: existe `ip nat outside`?',
        'Na interface WAN: `ip nat outside`. (e confirme `ip nat inside` na LAN).',
      ],
      guided: ['show ip nat translations', 'show running-config', 'configure terminal', 'interface gi0/1', 'ip nat outside', 'end', 'ping 8.8.8.8', 'show ip nat translations'],
      debrief:
        'Sem `ip nat outside` na WAN, o roteador não sabia onde "aplicar" a tradução — então os pacotes saíam com IP ' +
        'privado e a internet os descartava (e nenhuma tradução era criada). Marcando Gi0/1 como outside, o PAT ' +
        'passou a reescrever origem para o IP público com portas distintas. NAT exige sempre inside + outside definidos.',
      world() {
        return {
          devices: [
            {
              id: 'R-BORDA', name: 'R-BORDA', type: 'router', ipRouting: true,
              interfaces: [
                { name: 'gi0/0', connected: true, adminUp: true, isSwitchport: false, ip: '192.168.10.1', mask: '255.255.255.0', ipNat: 'inside', description: 'LAN' },
                { name: 'gi0/1', connected: true, adminUp: true, isSwitchport: false, ip: '200.1.1.2', mask: '255.255.255.252', ipNat: null, description: 'WAN-ISP' }, // FAULT: sem ip nat outside
              ],
              acls: { '1': { type: 'standard', named: false, rules: [{ action: 'permit', src: '192.168.10.0', srcWild: '0.0.0.255' }] } },
              nat: { rules: [{ acl: '1', iface: 'GigabitEthernet0/1', overload: true }], pat: true, translations: [] },
              staticRoutes: [{ net: '0.0.0.0', mask: '0.0.0.0', nh: '200.1.1.1' }],
              meta: { gateway: '200.1.1.1' },
            },
            { id: 'PC-LAN', name: 'PC-LAN', type: 'pc', ip: '192.168.10.10', mask: '255.255.255.0', gateway: '192.168.10.1', dns: '8.8.8.8' },
          ],
        };
      },
      evaluate(w) {
        const r = dev(w, 'R-BORDA');
        const inside = iface(w, 'R-BORDA', 'gi0/0').ipNat === 'inside';
        const outside = iface(w, 'R-BORDA', 'gi0/1').ipNat === 'outside';
        const rule = (r.nat.rules || []).some((x) => x.overload);
        if (inside && outside && rule) {
          r.nat.translations = [{ proto: 'icmp', insideGlobal: '200.1.1.2:1', insideLocal: '192.168.10.10:1', outsideLocal: '8.8.8.8:1', outsideGlobal: '8.8.8.8:1' }];
          w._natOk = true;
        } else { r.nat.translations = []; w._natOk = false; }
      },
      objectives: [
        { id: 'o1', text: 'Verificar que não há traduções NAT ativas', check: () => true, auto: 'inspect' },
        { id: 'o2', text: 'Marcar a WAN (Gi0/1) como ip nat outside', check: (w) => iface(w, 'R-BORDA', 'gi0/1').ipNat === 'outside' },
        { id: 'o3', text: 'Confirmar a LAN (Gi0/0) como ip nat inside', check: (w) => iface(w, 'R-BORDA', 'gi0/0').ipNat === 'inside' },
        { id: 'o4', text: 'Validar ping de PC-LAN para 8.8.8.8', check: (w) => w._pinged && w._pinged['PC-LAN->8.8.8.8'] },
      ],
      topology: { nodes: [{ id: 'PC-LAN', label: 'PC-LAN', t: 'pc', x: 16, y: 50 }, { id: 'R-BORDA', label: 'R-BORDA', t: 'router', x: 45, y: 35 }, { id: 'ISP', label: 'ISP / 8.8.8.8', t: 'cloud', x: 82, y: 35 }], links: [{ a: 'PC-LAN', b: 'R-BORDA', l: 'inside' }, { a: 'R-BORDA', b: 'ISP', l: 'outside ✗', fault: true }] },
      connectivity(w, src, target) {
        if (target === '8.8.8.8') return w._natOk ? { ok: true, ttl: 117, path: [src.gateway, '200.1.1.1', '8.8.8.8'] } : { ok: false, reason: 'timeout' };
        return { ok: false, reason: 'timeout' };
      },
    });

    // ---- MISSION 9 : ACL ------------------------------------------------
    M.push({
      id: 'm9', code: 'NOA-203', title: 'O Muro Invisível', place: 'Data Center', act: 'ENSA',
      xp: 320, badge: 'Arquiteta de ACLs', difficulty: 4,
      concepts: ['ACL', 'Wildcard mask', 'Deny implícito', 'Ordem das regras'],
      symptom: 'Quase todo o setor Staff perdeu acesso ao servidor DB. Só o gerente (192.168.10.5) consegue.',
      briefing:
        'Uma ACL deveria liberar o setor Staff (192.168.10.0/24) ao servidor DB. Mas só o host .5 funciona — sinal ' +
        'clássico de WILDCARD errada: alguém permitiu apenas UM host (host .5) e o "deny implícito" no fim barrou ' +
        'todo o resto. Você precisa liberar a SUB-REDE inteira, não um host só.',
      intel: [
        'ACL standard STAFF aplicada na entrada do DB. Hoje só contém: permit host 192.168.10.5.',
        'Toda ACL termina com um "deny any" implícito — por isso .10, .20, .30… caem.',
        'Adicione um permit para 192.168.10.0 0.0.0.255 (a sub-rede /24).',
      ],
      hints: [
        '`show access-lists`: quantas linhas? Qual o alcance da permissão?',
        'permit de UM host (wildcard 0.0.0.0) não cobre a sub-rede. Precisa de 0.0.0.255.',
        'Em `ip access-list standard STAFF`: `permit 192.168.10.0 0.0.0.255`.',
      ],
      guided: ['show access-lists', 'configure terminal', 'ip access-list standard STAFF', 'permit 192.168.10.0 0.0.0.255', 'end', 'show access-lists'],
      debrief:
        'A regra `permit host 192.168.10.5` tem wildcard 0.0.0.0 — casa SÓ com o .5. Os demais hosts caíam no deny ' +
        'implícito final. Acrescentando `permit 192.168.10.0 0.0.0.255`, a sub-rede /24 inteira passou. Sempre ' +
        'pense na wildcard como o "inverso" da máscara: 0.0.0.255 libera os 256 endereços do /24.',
      world() {
        return {
          devices: [
            {
              id: 'R-DC', name: 'R-DC', type: 'router', ipRouting: true,
              interfaces: [
                { name: 'gi0/0', connected: true, adminUp: true, isSwitchport: false, ip: '192.168.10.1', mask: '255.255.255.0', description: 'STAFF' },
                { name: 'gi0/1', connected: true, adminUp: true, isSwitchport: false, ip: '10.10.10.1', mask: '255.255.255.0', description: 'DB-SEGMENT' },
              ],
              acls: { 'STAFF': { type: 'standard', named: true, rules: [{ action: 'permit', src: '192.168.10.5', srcWild: '0.0.0.0' }] } }, // FAULT: só host .5
              meta: { aclApplied: 'STAFF' },
            },
            { id: 'PC-MGR', name: 'PC-GERENTE', type: 'pc', ip: '192.168.10.5', mask: '255.255.255.0', gateway: '192.168.10.1' },
            { id: 'PC-STAFF', name: 'PC-STAFF', type: 'pc', ip: '192.168.10.20', mask: '255.255.255.0', gateway: '192.168.10.1' },
            { id: 'DB', name: 'DB-SRV', type: 'server', ip: '10.10.10.50', mask: '255.255.255.0', gateway: '10.10.10.1' },
          ],
        };
      },
      objectives: [
        { id: 'o1', text: 'Diagnosticar a ACL STAFF (permite só 1 host)', check: () => true, auto: 'inspect' },
        { id: 'o2', text: 'Permitir a sub-rede 192.168.10.0/24 na ACL STAFF', check: (w) => (dev(w, 'R-DC').acls['STAFF'].rules || []).some((r) => r.action === 'permit' && r.src === '192.168.10.0' && r.srcWild === '0.0.0.255') },
        { id: 'o3', text: 'Validar ping de PC-STAFF (.20) para DB (10.10.10.50)', check: (w) => w._pinged && w._pinged['PC-STAFF->10.10.10.50'] },
      ],
      topology: { nodes: [{ id: 'PC-STAFF', label: 'PC-STAFF', t: 'pc', x: 16, y: 30 }, { id: 'PC-MGR', label: 'PC-GERENTE', t: 'pc', x: 16, y: 72 }, { id: 'R-DC', label: 'R-DC 🧱', t: 'router', x: 50, y: 50 }, { id: 'DB', label: 'DB-SRV', t: 'server', x: 84, y: 50 }], links: [{ a: 'PC-STAFF', b: 'R-DC', l: '✗ negado', fault: true }, { a: 'PC-MGR', b: 'R-DC', l: 'ok' }, { a: 'R-DC', b: 'DB', l: 'DB' }] },
      connectivity(w, src, target) {
        const acl = dev(w, 'R-DC').acls['STAFF'];
        const allowed = aclPermitsStd(acl, src.ip);
        if (target === '10.10.10.50') return allowed ? { ok: true, ttl: 126 } : { ok: false, reason: 'net-unreachable' };
        return { ok: false, reason: 'timeout' };
      },
    });

    // ---- MISSION 10 : DHCP / RELAY --------------------------------------
    M.push({
      id: 'm10', code: 'NOA-204', title: 'O Mensageiro Perdido', place: 'Filial Sul', act: 'ENSA',
      xp: 320, badge: 'Mestra do DHCP', difficulty: 4,
      concepts: ['DHCP', 'DHCP Relay', 'ip helper-address', 'Broadcast'],
      symptom: 'Os PCs da Filial Sul não recebem IP automaticamente (ficam em APIPA 169.254.x.x). O servidor DHCP é central.',
      briefing:
        'O servidor DHCP central (10.0.0.10) atende várias filiais. Mas o DHCP usa BROADCAST, e roteadores NÃO ' +
        'encaminham broadcast por padrão. Por isso o pedido dos PCs da Filial Sul morre no gateway. A solução é o ' +
        'DHCP Relay: o `ip helper-address` faz o roteador converter o broadcast em unicast para o servidor.',
      intel: [
        'PCs da Filial Sul estão na 192.168.30.0/24; gateway R-SUL Gi0/0 = 192.168.30.1.',
        'Servidor DHCP central = 10.0.0.10 (alcançável pela WAN).',
        'Falta `ip helper-address 10.0.0.10` na interface LAN do R-SUL.',
      ],
      hints: [
        'PC com 169.254.x.x = não recebeu DHCP (APIPA). O DISCOVER é broadcast e não cruza o roteador.',
        'Configure DHCP Relay apontando para o servidor central.',
        'Na Gi0/0 do R-SUL: `ip helper-address 10.0.0.10`.',
      ],
      guided: ['show ip interface brief', 'configure terminal', 'interface gi0/0', 'ip helper-address 10.0.0.10', 'end', 'show running-config'],
      debrief:
        'Sem o helper-address, o broadcast DHCP dos clientes não passava do gateway, então ninguém recebia endereço ' +
        '(APIPA). Com `ip helper-address 10.0.0.10`, o R-SUL passou a repassar os pedidos em unicast ao servidor ' +
        'central, que respondeu com IPs da faixa correta. DHCP Relay é o elo entre clientes e servidor em sub-redes distintas.',
      world() {
        return {
          devices: [
            {
              id: 'R-SUL', name: 'R-SUL', type: 'router', ipRouting: true,
              interfaces: [
                { name: 'gi0/0', connected: true, adminUp: true, isSwitchport: false, ip: '192.168.30.1', mask: '255.255.255.0', helper: null, description: 'LAN-SUL' }, // FAULT
                { name: 'gi0/1', connected: true, adminUp: true, isSwitchport: false, ip: '10.0.0.6', mask: '255.255.255.252', description: 'WAN' },
              ],
            },
            { id: 'PC-S', name: 'PC-SUL', type: 'pc', ip: '169.254.10.5', mask: '255.255.0.0', gateway: '(none)', dns: '(none)' },
            { id: 'DHCP', name: 'DHCP-SRV', type: 'server', ip: '10.0.0.10', mask: '255.255.255.0' },
          ],
        };
      },
      evaluate(w) {
        const i = iface(w, 'R-SUL', 'gi0/0');
        const pc = dev(w, 'PC-S');
        if (i.helper === '10.0.0.10') {
          pc.ip = '192.168.30.50'; pc.mask = '255.255.255.0'; pc.gateway = '192.168.30.1'; pc.dns = '10.0.0.10';
          w._leased = true;
        } else { pc.ip = '169.254.10.5'; pc.mask = '255.255.0.0'; pc.gateway = '(none)'; w._leased = false; }
      },
      objectives: [
        { id: 'o1', text: 'Confirmar que o PC está em APIPA (sem DHCP)', check: () => true, auto: 'inspect' },
        { id: 'o2', text: 'Configurar ip helper-address 10.0.0.10 na LAN do R-SUL', check: (w) => iface(w, 'R-SUL', 'gi0/0').helper === '10.0.0.10' },
        { id: 'o3', text: 'PC-SUL recebe IP válido da faixa 192.168.30.0/24', check: (w) => !!w._leased },
      ],
      topology: { nodes: [{ id: 'PC-S', label: 'PC-SUL', t: 'pc', x: 16, y: 50 }, { id: 'R-SUL', label: 'R-SUL', t: 'router', x: 45, y: 35 }, { id: 'DHCP', label: 'DHCP-SRV', t: 'server', x: 82, y: 35 }], links: [{ a: 'PC-S', b: 'R-SUL', l: 'broadcast ✗', fault: true }, { a: 'R-SUL', b: 'DHCP', l: 'WAN' }] },
      connectivity(w, src, target) {
        if (!w._leased) return { ok: false, reason: 'unreachable-host' };
        return { ok: true, ttl: 126 };
      },
    });

    // ---- MISSION 11 : WAN TROUBLESHOOTING -------------------------------
    M.push({
      id: 'm11', code: 'NOA-205', title: 'A Filial Isolada', place: 'Filial Norte', act: 'ENSA',
      xp: 360, badge: 'Detetive da WAN', difficulty: 5,
      concepts: ['WAN', 'Interface down', 'Adjacência OSPF', 'traceroute'],
      symptom: 'A Filial Norte caiu por completo. A Matriz não alcança nada lá. O enlace serial WAN parece morto.',
      briefing:
        'Plantão noturno: a Filial Norte está 100% isolada. Você já sabe diagnosticar OSPF, mas aqui o problema é ' +
        'mais básico e crítico — a interface serial da WAN no R-NORTE foi deixada administrativamente DESLIGADA. ' +
        'Sem camada física/enlace, não há OSPF, não há rota, não há nada. Use ping e traceroute para localizar a quebra.',
      intel: [
        'Enlace WAN serial: R-HQ Se0/0/0 (.1) — R-NORTE Se0/0/0 (.2), rede 10.0.0.0/30. OSPF área 0.',
        '`show ip interface brief` no R-NORTE: Se0/0/0 = administratively down.',
        'Religue a interface (no shutdown) — a adjacência e as rotas voltam sozinhas.',
      ],
      hints: [
        'traceroute da Matriz morre no próprio R-HQ → a quebra está no enlace ou no outro lado.',
        '`show ip interface brief` no R-NORTE: procure "administratively down".',
        'Em Se0/0/0: `no shutdown`.',
      ],
      guided: ['show ip interface brief', 'configure terminal', 'interface se0/0/0', 'no shutdown', 'end', 'show ip ospf neighbor', 'show ip route'],
      debrief:
        'A serial da WAN estava em shutdown — camada 1/2 fora, logo o OSPF não tinha por onde formar adjacência e a ' +
        'rota para a filial desaparecera. Um simples `no shutdown` ressuscitou o enlace; o OSPF reconvergiu e a ' +
        'Filial Norte voltou. Troubleshooting de WAN começa SEMPRE de baixo: a interface está up/up?',
      world() {
        return {
          devices: [
            {
              id: 'R-HQ', name: 'R-HQ', type: 'router', ipRouting: true,
              interfaces: [
                { name: 'gi0/0', connected: true, adminUp: true, isSwitchport: false, ip: '192.168.1.1', mask: '255.255.255.0', description: 'LAN-MATRIZ' },
                { name: 'se0/0/0', connected: true, adminUp: true, isSwitchport: false, ip: '10.0.0.1', mask: '255.255.255.252', description: 'WAN p/ NORTE' },
              ],
              ospf: { pid: 1, routerId: '1.1.1.1', networks: [{ net: '192.168.1.0', wild: '0.0.0.255', area: 0 }, { net: '10.0.0.0', wild: '0.0.0.3', area: 0 }], passive: [] },
            },
            {
              id: 'R-NORTE', name: 'R-NORTE', type: 'router', ipRouting: true,
              interfaces: [
                { name: 'gi0/0', connected: true, adminUp: true, isSwitchport: false, ip: '192.168.20.1', mask: '255.255.255.0', description: 'LAN-NORTE' },
                { name: 'se0/0/0', connected: true, adminUp: false, isSwitchport: false, ip: '10.0.0.2', mask: '255.255.255.252', description: 'WAN p/ HQ' }, // FAULT: shutdown
              ],
              ospf: { pid: 1, routerId: '2.2.2.2', networks: [{ net: '192.168.20.0', wild: '0.0.0.255', area: 0 }, { net: '10.0.0.0', wild: '0.0.0.3', area: 0 }], passive: [] },
            },
            { id: 'PC-HQ', name: 'PC-HQ', type: 'pc', ip: '192.168.1.10', mask: '255.255.255.0', gateway: '192.168.1.1' },
            { id: 'PC-N', name: 'PC-NORTE', type: 'pc', ip: '192.168.20.10', mask: '255.255.255.0', gateway: '192.168.20.1' },
          ],
        };
      },
      evaluate(w) {
        const hq = dev(w, 'R-HQ'), no = dev(w, 'R-NORTE');
        const up = iface(w, 'R-NORTE', 'se0/0/0').status === 'up';
        if (up) {
          hq.meta.ospfNeighbors = [{ id: '2.2.2.2', state: 'FULL/  -', address: '10.0.0.2', iface: 'Se0/0/0' }];
          no.meta.ospfNeighbors = [{ id: '1.1.1.1', state: 'FULL/  -', address: '10.0.0.1', iface: 'Se0/0/0' }];
          hq.meta.learnedRoutes = [{ kind: 'O', net: '192.168.20.0', mask: '255.255.255.0', nh: '10.0.0.2', iface: 'Se0/0/0', metric: 65 }];
          no.meta.learnedRoutes = [{ kind: 'O', net: '192.168.1.0', mask: '255.255.255.0', nh: '10.0.0.1', iface: 'Se0/0/0', metric: 65 }];
          w._wanUp = true;
        } else { hq.meta.ospfNeighbors = []; no.meta.ospfNeighbors = []; hq.meta.learnedRoutes = []; no.meta.learnedRoutes = []; w._wanUp = false; }
      },
      objectives: [
        { id: 'o1', text: 'Localizar a interface WAN derrubada no R-NORTE', check: () => true, auto: 'inspect' },
        { id: 'o2', text: 'Reativar a serial Se0/0/0 do R-NORTE (no shutdown)', check: (w) => iface(w, 'R-NORTE', 'se0/0/0').status === 'up' },
        { id: 'o3', text: 'Readquirir adjacência OSPF na WAN', check: (w) => !!w._wanUp },
        { id: 'o4', text: 'Validar ping de PC-HQ para PC-NORTE (192.168.20.10)', check: (w) => w._pinged && w._pinged['PC-HQ->192.168.20.10'] },
      ],
      topology: { nodes: [{ id: 'R-HQ', label: 'R-HQ', t: 'router', x: 28, y: 30 }, { id: 'R-NORTE', label: 'R-NORTE', t: 'router', x: 72, y: 30 }, { id: 'PC-HQ', label: 'PC-HQ', t: 'pc', x: 14, y: 78 }, { id: 'PC-N', label: 'PC-NORTE', t: 'pc', x: 86, y: 78 }], links: [{ a: 'R-HQ', b: 'R-NORTE', l: 'WAN serial ✗', fault: true }, { a: 'R-HQ', b: 'PC-HQ', l: 'LAN' }, { a: 'R-NORTE', b: 'PC-N', l: 'LAN' }] },
      connectivity(w, src, target) {
        if (!w._wanUp) return { ok: false, reason: 'net-unreachable', partial: [src.gateway] };
        return { ok: true, ttl: 126, path: [src.gateway, '10.0.0.2', target] };
      },
    });

    /* ===================== ACT III — FINALE ===================== */

    // ---- FINAL : O COLAPSO ----------------------------------------------
    M.push({
      id: 'mF', code: 'NOA-300', title: 'O Colapso da NetDefend', place: 'SOC', act: 'FINAL',
      xp: 600, badge: 'Arquiteta de Infraestrutura', difficulty: 5, final: true,
      concepts: ['VLAN', 'Trunk', 'OSPF', 'NAT', 'ACL', 'Troubleshooting integrado'],
      symptom: 'INCIDENTE MÁXIMO: múltiplas falhas simultâneas derrubaram a empresa. A diretoria está no seu pescoço.',
      briefing:
        'Era para ser uma noite tranquila. Não foi. Uma mudança malsucedida quebrou VÁRIAS camadas ao mesmo tempo: ' +
        'um acesso na VLAN errada, um trunk caído, o OSPF sem anunciar um enlace, o NAT sem saída e uma ACL barrando ' +
        'tráfego legítimo. Restaure a NetDefend de ponta a ponta: o PC-CORP precisa chegar à internet (8.8.8.8) e à ' +
        'filial. Trabalhe de baixo (L2) para cima (L3/serviços). Boa sorte, analista.',
      intel: [
        'Falha 1 (L2): SW-ACC Fa0/1 (PC-CORP) está na VLAN errada — deveria ser VLAN 10.',
        'Falha 2 (L2): trunk SW-ACC Gi0/1 ↔ R-GW caiu para access — recoloque em trunk.',
        'Falha 3 (L3): R-GW não anuncia o enlace 10.0.0.0/30 no OSPF área 0 (sem rota p/ filial).',
        'Falha 4 (NAT): WAN do R-GW (Gi0/2) sem `ip nat outside` — sem internet.',
        'Falha 5 (ACL): ACL CORP só permite 1 host — libere a sub-rede 192.168.10.0/24.',
      ],
      hints: [
        'Comece pela camada 2: VLAN da porta e modo do trunk. Sem L2, nada acima funciona.',
        'Depois L3: anuncie o enlace no OSPF e marque `ip nat outside` na WAN.',
        'Por fim a ACL CORP: troque o permit de host pelo da sub-rede /24.',
        'Valide com `ping 8.8.8.8` e `ping 192.168.20.10` no PC-CORP.',
      ],
      guided: [
        'show vlan brief', 'show interfaces trunk', 'show ip ospf neighbor', 'show ip nat translations', 'show access-lists',
        'configure terminal',
        'interface gi0/0.10', 'exit',
      ],
      debrief:
        'Você restaurou a NetDefend resolvendo a cadeia de falhas na ordem certa: primeiro a camada 2 (VLAN + trunk), ' +
        'que é a fundação; depois a camada 3 e serviços (OSPF para ter rota, NAT para ter saída, ACL para liberar o ' +
        'tráfego correto). Esse é o raciocínio de um engenheiro sênior: isolar por camadas, do físico ao aplicativo, ' +
        'e validar cada correção com testes objetivos. Parabéns — você se formou na Network Ops Academy.',
      world() {
        return {
          devices: [
            {
              id: 'SW-ACC', name: 'SW-ACC', type: 'switch', vlans: [{ id: 10, name: 'CORP' }, { id: 20, name: 'VOZ' }],
              interfaces: [
                { name: 'fa0/1', connected: true, adminUp: true, mode: 'access', accessVlan: 1, description: 'PC-CORP' }, // FALHA 1
                { name: 'gi0/1', connected: true, adminUp: true, mode: 'access', description: 'TRUNK p/ R-GW' }, // FALHA 2
              ],
            },
            {
              id: 'R-GW', name: 'R-GW', type: 'router', ipRouting: true,
              interfaces: [
                { name: 'gi0/0', connected: true, adminUp: true, isSwitchport: false, description: 'TRUNK' },
                { name: 'gi0/0.10', connected: true, adminUp: true, isSwitchport: false, ip: '192.168.10.1', mask: '255.255.255.0', encap: { dot1q: 10 }, ipNat: 'inside' },
                { name: 'gi0/1', connected: true, adminUp: true, isSwitchport: false, ip: '10.0.0.1', mask: '255.255.255.252', description: 'WAN-FILIAL' },
                { name: 'gi0/2', connected: true, adminUp: true, isSwitchport: false, ip: '200.1.1.2', mask: '255.255.255.252', ipNat: null, description: 'WAN-ISP' }, // FALHA 4
              ],
              ospf: { pid: 1, routerId: '9.9.9.9', networks: [{ net: '192.168.10.0', wild: '0.0.0.255', area: 0 }], passive: [] }, // FALHA 3: falta enlace
              acls: { 'CORP': { type: 'standard', named: true, rules: [{ action: 'permit', src: '192.168.10.5', srcWild: '0.0.0.0' }] } }, // FALHA 5
              nat: { rules: [{ acl: 'CORP', iface: 'GigabitEthernet0/2', overload: true }], pat: true, translations: [] },
              staticRoutes: [{ net: '0.0.0.0', mask: '0.0.0.0', nh: '200.1.1.1' }],
              meta: { gateway: '200.1.1.1' },
            },
            { id: 'R-FIL', name: 'R-FILIAL', type: 'router', ipRouting: true, interfaces: [{ name: 'gi0/0', connected: true, adminUp: true, isSwitchport: false, ip: '192.168.20.1', mask: '255.255.255.0' }, { name: 'gi0/1', connected: true, adminUp: true, isSwitchport: false, ip: '10.0.0.2', mask: '255.255.255.252' }], ospf: { pid: 1, routerId: '8.8.8.9', networks: [{ net: '192.168.20.0', wild: '0.0.0.255', area: 0 }, { net: '10.0.0.0', wild: '0.0.0.3', area: 0 }], passive: [] } },
            { id: 'PC-CORP', name: 'PC-CORP', type: 'pc', ip: '192.168.10.10', mask: '255.255.255.0', gateway: '192.168.10.1', dns: '8.8.8.8' },
            { id: 'PC-FIL', name: 'PC-FILIAL', type: 'pc', ip: '192.168.20.10', mask: '255.255.255.0', gateway: '192.168.20.1' },
            { id: 'ISP', name: 'ISP', type: 'cloud', ip: '8.8.8.8', mask: '255.0.0.0' },
          ],
        };
      },
      evaluate(w) {
        const f1 = iface(w, 'SW-ACC', 'fa0/1').accessVlan === 10;
        const f2 = iface(w, 'SW-ACC', 'gi0/1').mode === 'trunk';
        const gw = dev(w, 'R-GW');
        const f3 = (gw.ospf.networks || []).some((n) => n.net === '10.0.0.0' && n.area === 0);
        const f4 = iface(w, 'R-GW', 'gi0/2').ipNat === 'outside' && iface(w, 'R-GW', 'gi0/0.10').ipNat === 'inside';
        const f5 = (gw.acls['CORP'].rules || []).some((r) => r.action === 'permit' && r.src === '192.168.10.0' && r.srcWild === '0.0.0.255');
        w._f = { f1, f2, f3, f4, f5 };
        // L2 path PC-CORP -> gateway requires f1+f2
        w._l2 = f1 && f2;
        // OSPF adjacency to filial
        if (f3) { gw.meta.ospfNeighbors = [{ id: '8.8.8.9', state: 'FULL/DR', address: '10.0.0.2', iface: 'Gi0/1' }]; gw.meta.learnedRoutes = [{ kind: 'O', net: '192.168.20.0', mask: '255.255.255.0', nh: '10.0.0.2', iface: 'Gi0/1', metric: 2 }]; }
        else { gw.meta.ospfNeighbors = []; gw.meta.learnedRoutes = []; }
        if (f4) gw.nat.translations = [{ proto: 'icmp', insideGlobal: '200.1.1.2:1', insideLocal: '192.168.10.10:1', outsideLocal: '8.8.8.8:1', outsideGlobal: '8.8.8.8:1' }];
        else gw.nat.translations = [];
        w._toInternet = w._l2 && f4 && f5;
        w._toFilial = w._l2 && f3 && f5;
        w._restored = f1 && f2 && f3 && f4 && f5;
      },
      objectives: [
        { id: 'o1', text: 'L2 — corrigir VLAN do PC-CORP (Fa0/1 → VLAN 10)', check: (w) => iface(w, 'SW-ACC', 'fa0/1').accessVlan === 10 },
        { id: 'o2', text: 'L2 — restaurar o trunk SW-ACC Gi0/1', check: (w) => iface(w, 'SW-ACC', 'gi0/1').mode === 'trunk' },
        { id: 'o3', text: 'L3 — anunciar enlace 10.0.0.0/30 no OSPF do R-GW', check: (w) => (dev(w, 'R-GW').ospf.networks || []).some((n) => n.net === '10.0.0.0' && n.area === 0) },
        { id: 'o4', text: 'NAT — marcar a WAN-ISP (Gi0/2) como ip nat outside', check: (w) => iface(w, 'R-GW', 'gi0/2').ipNat === 'outside' },
        { id: 'o5', text: 'ACL — liberar a sub-rede 192.168.10.0/24 na ACL CORP', check: (w) => (dev(w, 'R-GW').acls['CORP'].rules || []).some((r) => r.src === '192.168.10.0' && r.srcWild === '0.0.0.255') },
        { id: 'o6', text: 'Validar ping de PC-CORP para 8.8.8.8 (internet)', check: (w) => w._pinged && w._pinged['PC-CORP->8.8.8.8'] },
        { id: 'o7', text: 'Validar ping de PC-CORP para a filial (192.168.20.10)', check: (w) => w._pinged && w._pinged['PC-CORP->192.168.20.10'] },
      ],
      topology: {
        nodes: [
          { id: 'PC-CORP', label: 'PC-CORP', t: 'pc', x: 12, y: 30 },
          { id: 'SW-ACC', label: 'SW-ACC', t: 'switch', x: 32, y: 30 },
          { id: 'R-GW', label: 'R-GW', t: 'router', x: 55, y: 45 },
          { id: 'ISP', label: 'INTERNET', t: 'cloud', x: 80, y: 20 },
          { id: 'R-FIL', label: 'R-FILIAL', t: 'router', x: 80, y: 68 },
          { id: 'PC-FIL', label: 'PC-FILIAL', t: 'pc', x: 95, y: 90 },
        ],
        links: [
          { a: 'PC-CORP', b: 'SW-ACC', l: 'Fa0/1 ✗', fault: true },
          { a: 'SW-ACC', b: 'R-GW', l: 'trunk ✗', fault: true },
          { a: 'R-GW', b: 'ISP', l: 'NAT ✗', fault: true },
          { a: 'R-GW', b: 'R-FIL', l: 'OSPF ✗', fault: true },
          { a: 'R-FIL', b: 'PC-FIL', l: 'LAN' },
        ],
      },
      connectivity(w, src, target) {
        if (src.id !== 'PC-CORP') return { ok: false, reason: 'timeout' };
        if (target === '8.8.8.8') return w._toInternet ? { ok: true, ttl: 117, path: [src.gateway, '200.1.1.1', '8.8.8.8'] } : { ok: false, reason: w._l2 ? 'timeout' : 'net-unreachable' };
        if (target === '192.168.20.10') return w._toFilial ? { ok: true, ttl: 126, path: [src.gateway, '10.0.0.2', target] } : { ok: false, reason: 'net-unreachable' };
        return { ok: false, reason: 'timeout' };
      },
    });

    // ---- merge expansion missions (m12..m18) BEFORE the final boss --------
    if (root.NOA_MISSIONS_EXT && typeof root.NOA_MISSIONS_EXT.buildExt === 'function') {
      var ext = root.NOA_MISSIONS_EXT.buildExt(E);
      var fIdx = M.findIndex(function (m) { return m.id === 'mF'; });
      if (fIdx < 0) fIdx = M.length;
      M.splice.apply(M, [fIdx, 0].concat(ext));
    }
    return M;
  }

  const API = { build };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.NOA_MISSIONS = API;
})(typeof window !== 'undefined' ? window : globalThis);

/* ===== missions-ext.js ===== */
/* ============================================================================
 * Network Ops Academy — Expansion Missions (missions-ext.js)
 * 7 missões que completam a cobertura SRWE + ENSA:
 *   m12 Wireless/WLAN · m13 HSRP/FHRP · m14 IPv6 ·
 *   m15 Gestão de Rede (NTP/SNMP/Syslog) · m16 QoS · m17 VPN/IPsec · m18 Automação
 * Mesmo schema das missões base.
 * ==========================================================================*/
(function (root) {
  'use strict';

  function buildExt(E) {
    const norm = E.normIface;
    function dev(w, id) { return w.devices[id]; }
    function iface(w, id, name) { return w.devices[id].interfaces[norm(name)]; }

    const X = [];

    /* ================= SRWE · WIRELESS ================= */
    X.push({
      id: 'm12', code: 'NOA-107', title: 'O Sinal Fantasma', place: 'Campus Wi-Fi', act: 'SRWE',
      xp: 280, badge: 'Domadora de Wi-Fi', difficulty: 2,
      concepts: ['WLAN', 'WLC', 'SSID', 'WPA2-PSK', 'Wireless'],
      symptom: 'Os portáteis do open space veem o controlador, mas nenhum SSID aparece. A rede sem fios "não existe".',
      briefing:
        'A NetDefend instalou um WLC (Wireless LAN Controller) novo no Campus, com APs já ligados via PoE. ' +
        'Os utilizadores não encontram nenhuma rede Wi-Fi. Num modelo Cisco, o AP só irradia um SSID depois de ' +
        'existir uma WLAN criada, com segurança definida e o estado ENABLED no controlador. Configure a WLAN ' +
        'corporativa e ponha o open space online.',
      intel: [
        'O WLC gere tudo de forma central — os APs são "leves" (lightweight).',
        'Sem WLAN criada/ativada, o AP não anuncia SSID nenhum.',
        'Política da empresa: WPA2-PSK (a chave é NetDef@2024).',
        'O cliente PC-WIFI (192.168.50.10) deve alcançar o servidor 192.168.50.50.',
      ],
      hints: [
        'Use `show wlan summary` para ver o que (não) existe.',
        'Crie a WLAN: `config wlan create 1 CORP NetDefend-Corp`.',
        'Ative WPA2 e a chave, depois `config wlan enable 1`.',
      ],
      guided: [
        'show wlan summary',
        'config wlan create 1 CORP NetDefend-Corp',
        'config wlan security wpa akm psk enable 1',
        'config wlan security wpa akm psk set-key ascii NetDef@2024 1',
        'config wlan interface 1 management',
        'config wlan enable 1',
        'show wlan summary',
        '# muda para PC-WIFI e testa:',
        'ping 192.168.50.50',
      ],
      debrief:
        'O AP não anunciava nada porque não havia WLAN ativa no controlador. Ao criar a WLAN, aplicar WPA2-PSK ' +
        'com chave e mudar o estado para ENABLED, o SSID "NetDefend-Corp" passou a ser irradiado e os clientes ' +
        'associaram-se. Lição: num WLC, uma WLAN só serve clientes quando reúne SSID + segurança + ENABLE.',
      world() {
        return {
          devices: [
            { id: 'WLC-1', name: 'WLC-1', type: 'wlc', wlan: { wlans: {}, interfaces: { management: { vlan: 50 } } } },
            { id: 'PC-WIFI', name: 'PC-WIFI', type: 'pc', ip: '192.168.50.10', mask: '255.255.255.0', gateway: '192.168.50.1', dns: '192.168.50.50' },
            { id: 'SRV-INTRA', name: 'SRV-INTRA', type: 'server', ip: '192.168.50.50', mask: '255.255.255.0' },
          ],
        };
      },
      objectives: [
        { id: 'o1', text: 'Inspecionar o controlador (show wlan summary)', check: () => true, auto: 'inspect' },
        { id: 'o2', text: 'Criar a WLAN 1 (SSID NetDefend-Corp)', check: (w) => { const wl = dev(w, 'WLC-1').wlan.wlans['1']; return !!wl && /NetDefend-Corp/i.test(wl.ssid); } },
        { id: 'o3', text: 'Aplicar segurança WPA2-PSK com chave', check: (w) => { const wl = dev(w, 'WLC-1').wlan.wlans['1']; return !!wl && wl.security === 'wpa2-psk' && !!wl.psk; } },
        { id: 'o4', text: 'Ativar a WLAN 1 (ENABLE)', check: (w) => { const wl = dev(w, 'WLC-1').wlan.wlans['1']; return !!wl && wl.enabled === true; } },
        { id: 'o5', text: 'Validar ping de PC-WIFI para 192.168.50.50', check: (w) => w._pinged && w._pinged['PC-WIFI->192.168.50.50'] },
      ],
      topology: {
        nodes: [
          { id: 'WLC-1', label: 'WLC-1', t: 'wlc', x: 50, y: 16 },
          { id: 'PC-WIFI', label: 'PC-WIFI', t: 'pc', x: 24, y: 74 },
          { id: 'SRV-INTRA', label: 'SRV-INTRA', t: 'server', x: 76, y: 74 },
        ],
        links: [
          { a: 'WLC-1', b: 'PC-WIFI', l: 'SSID ✗', fault: true },
          { a: 'WLC-1', b: 'SRV-INTRA', l: 'Gi0/1' },
        ],
      },
      connectivity(w, src, target) {
        if (src.id !== 'PC-WIFI' || target !== '192.168.50.50') return { ok: false, reason: 'timeout' };
        const wl = dev(w, 'WLC-1').wlan.wlans['1'];
        const up = wl && wl.enabled && wl.security === 'wpa2-psk' && wl.psk;
        return up ? { ok: true, ttl: 128 } : { ok: false, reason: 'timeout' };
      },
    });

    /* ================= SRWE · HSRP / FHRP ================= */
    X.push({
      id: 'm13', code: 'NOA-108', title: 'O Gateway Vacilante', place: 'Núcleo Redundante', act: 'SRWE',
      xp: 300, badge: 'Guardiã da Redundância', difficulty: 3,
      concepts: ['FHRP', 'HSRP', 'Gateway virtual', 'Alta disponibilidade'],
      symptom: 'Sempre que o router primário reinicia, toda a LAN perde a Internet. Não há failover automático.',
      briefing:
        'A sub-rede 192.168.1.0/24 tem dois routers (R1 e R2) para redundância, mas os PCs apontam para um único ' +
        'gateway fixo. Quando esse router cai, a rede morre. A solução é o FHRP — concretamente HSRP: os dois ' +
        'routers partilham um IP virtual (192.168.1.1) que os PCs usam como gateway. Configure HSRP no R1 com ' +
        'prioridade alta e preempt para ele assumir o papel ativo.',
      intel: [
        'Os PCs já usam 192.168.1.1 (virtual) como gateway.',
        'R1 = 192.168.1.2, R2 = 192.168.1.3, ambos com saída para a Internet.',
        'Quem tiver maior prioridade (e preempt) torna-se o router ATIVO.',
        'PC-LAN (192.168.1.10) deve alcançar 8.8.8.8 através do gateway virtual.',
      ],
      hints: [
        '`show standby brief` mostra o estado HSRP (provavelmente vazio).',
        'Na interface Gi0/0 do R1: `standby 1 ip 192.168.1.1`.',
        'Dê vantagem ao R1: `standby 1 priority 110` e `standby 1 preempt`.',
      ],
      guided: [
        'show standby brief',
        'configure terminal',
        'interface gi0/0',
        'standby version 2',
        'standby 1 ip 192.168.1.1',
        'standby 1 priority 110',
        'standby 1 preempt',
        'end',
        'show standby brief',
        '# muda para PC-LAN e testa:',
        'ping 8.8.8.8',
      ],
      debrief:
        'Sem HSRP, o gateway era um único ponto de falha. Ao criar o grupo HSRP 1 com o IP virtual 192.168.1.1 e ' +
        'dar ao R1 prioridade 110 + preempt, o R1 tornou-se o router ativo e o R2 ficou em standby, pronto a ' +
        'assumir em milissegundos se o R1 falhar. Os PCs nunca mudam o gateway — falam sempre com o IP virtual.',
      world() {
        return {
          devices: [
            { id: 'R1', name: 'R1', type: 'router', ipRouting: true,
              interfaces: [
                { name: 'gi0/0', connected: true, adminUp: true, ip: '192.168.1.2', mask: '255.255.255.0', isSwitchport: false },
                { name: 'gi0/1', connected: true, adminUp: true, ip: '203.0.113.1', mask: '255.255.255.252', isSwitchport: false },
              ] },
            { id: 'R2', name: 'R2', type: 'router', ipRouting: true,
              interfaces: [
                { name: 'gi0/0', connected: true, adminUp: true, ip: '192.168.1.3', mask: '255.255.255.0', isSwitchport: false },
                { name: 'gi0/1', connected: true, adminUp: true, ip: '203.0.113.5', mask: '255.255.255.252', isSwitchport: false },
              ] },
            { id: 'PC-LAN', name: 'PC-LAN', type: 'pc', ip: '192.168.1.10', mask: '255.255.255.0', gateway: '192.168.1.1', dns: '8.8.8.8' },
          ],
        };
      },
      objectives: [
        { id: 'o1', text: 'Verificar o estado HSRP (show standby brief)', check: () => true, auto: 'inspect' },
        { id: 'o2', text: 'Definir o IP virtual 192.168.1.1 (grupo 1) no R1', check: (w) => { const s = iface(w, 'R1', 'gi0/0').standby; return s && s[1] && s[1].ip === '192.168.1.1'; } },
        { id: 'o3', text: 'Dar prioridade 110 ao R1', check: (w) => { const s = iface(w, 'R1', 'gi0/0').standby; return s && s[1] && s[1].priority >= 105; } },
        { id: 'o4', text: 'Ativar preempt no R1', check: (w) => { const s = iface(w, 'R1', 'gi0/0').standby; return s && s[1] && s[1].preempt === true; } },
        { id: 'o5', text: 'Validar ping de PC-LAN para 8.8.8.8 (via gateway virtual)', check: (w) => w._pinged && w._pinged['PC-LAN->8.8.8.8'] },
      ],
      topology: {
        nodes: [
          { id: 'R1', label: 'R1 (ativo)', t: 'router', x: 30, y: 22 },
          { id: 'R2', label: 'R2 (standby)', t: 'router', x: 70, y: 22 },
          { id: 'PC-LAN', label: 'PC-LAN', t: 'pc', x: 50, y: 78 },
        ],
        links: [
          { a: 'R1', b: 'PC-LAN', l: 'VIP .1 ✗', fault: true },
          { a: 'R2', b: 'PC-LAN', l: 'VIP .1' },
          { a: 'R1', b: 'R2', l: 'HSRP' },
        ],
      },
      connectivity(w, src, target) {
        if (src.id !== 'PC-LAN' || target !== '8.8.8.8') return { ok: false, reason: 'timeout' };
        const s = iface(w, 'R1', 'gi0/0').standby;
        const active = s && s[1] && s[1].ip === '192.168.1.1';
        return active ? { ok: true, ttl: 117, path: ['192.168.1.1', '203.0.113.2', '8.8.8.8'] } : { ok: false, reason: 'net-unreachable' };
      },
    });

    /* ================= SRWE · IPv6 ================= */
    X.push({
      id: 'm14', code: 'NOA-109', title: 'O Mundo em 128 Bits', place: 'Data Center', act: 'SRWE',
      xp: 300, badge: 'Pioneira do IPv6', difficulty: 3,
      concepts: ['IPv6', 'ipv6 unicast-routing', 'Rota estática IPv6', 'Endereçamento'],
      symptom: 'O novo segmento IPv6 do data center não comunica com a rede dos servidores. IPv4 funciona; IPv6 não.',
      briefing:
        'A NetDefend está a migrar para IPv6. O cliente PC6 (2001:db8:a::10) precisa de chegar ao servidor ' +
        'SRV6 (2001:db8:b::50), que está atrás do R2. O router R1 nem sequer encaminha IPv6 — falta-lhe o ' +
        'reencaminhamento global e uma rota estática para a rede do servidor. Sem isso, os pacotes IPv6 morrem no R1.',
      intel: [
        'Por omissão, o IOS NÃO encaminha IPv6 (só IPv4).',
        'Liga-se o reencaminhamento com `ipv6 unicast-routing`.',
        'A rede do servidor (2001:db8:b::/64) é alcançada via R2 em 2001:db8:12::2.',
        'PC6 (2001:db8:a::10) deve fazer ping a 2001:db8:b::50.',
      ],
      hints: [
        '`show ipv6 route` revela que o R1 não tem rota para 2001:db8:b::/64.',
        'Ative o encaminhamento: `ipv6 unicast-routing`.',
        'Adicione: `ipv6 route 2001:db8:b::/64 2001:db8:12::2`.',
      ],
      guided: [
        'show ipv6 route',
        'configure terminal',
        'ipv6 unicast-routing',
        'ipv6 route 2001:db8:b::/64 2001:db8:12::2',
        'end',
        'show ipv6 route',
        '# muda para PC6 e testa:',
        'ping 2001:db8:b::50',
      ],
      debrief:
        'Dois problemas clássicos de IPv6: o reencaminhamento global estava desligado (`ipv6 unicast-routing`) e ' +
        'faltava a rota estática para a rede remota. Depois de ativar o encaminhamento e apontar 2001:db8:b::/64 ' +
        'para o R2, o R1 passou a entregar o tráfego IPv6 e o ping completou. IPv6 não é "IPv4 com mais bits" — ' +
        'precisa do seu próprio plano de encaminhamento.',
      world() {
        return {
          devices: [
            { id: 'R1', name: 'R1', type: 'router',
              interfaces: [
                { name: 'gi0/0', connected: true, adminUp: true, isSwitchport: false, ipv6: [{ addr: '2001:db8:a::1', prefix: 64 }] },
                { name: 'gi0/1', connected: true, adminUp: true, isSwitchport: false, ipv6: [{ addr: '2001:db8:12::1', prefix: 64 }] },
              ] },
            { id: 'R2', name: 'R2', type: 'router', ipv6Routing: true,
              interfaces: [
                { name: 'gi0/0', connected: true, adminUp: true, isSwitchport: false, ipv6: [{ addr: '2001:db8:12::2', prefix: 64 }] },
                { name: 'gi0/1', connected: true, adminUp: true, isSwitchport: false, ipv6: [{ addr: '2001:db8:b::1', prefix: 64 }] },
              ] },
            { id: 'PC6', name: 'PC6', type: 'pc', ip: '(IPv6)', mask: '/64', gateway: '2001:db8:a::1' },
            { id: 'SRV6', name: 'SRV6', type: 'server', ip: '(IPv6)', mask: '/64' },
          ],
        };
      },
      objectives: [
        { id: 'o1', text: 'Diagnosticar o encaminhamento IPv6 (show ipv6 route)', check: () => true, auto: 'inspect' },
        { id: 'o2', text: 'Ativar ipv6 unicast-routing no R1', check: (w) => dev(w, 'R1').ipv6Routing === true },
        { id: 'o3', text: 'Adicionar rota IPv6 para 2001:db8:b::/64', check: (w) => (dev(w, 'R1').ipv6Routes || []).some((r) => r.net === '2001:db8:b::' && r.prefix === 64) },
        { id: 'o4', text: 'Validar ping de PC6 para 2001:db8:b::50', check: (w) => w._pinged && w._pinged['PC6->2001:db8:b::50'] },
      ],
      topology: {
        nodes: [
          { id: 'PC6', label: 'PC6', t: 'pc', x: 12, y: 50 },
          { id: 'R1', label: 'R1', t: 'router', x: 38, y: 30 },
          { id: 'R2', label: 'R2', t: 'router', x: 64, y: 30 },
          { id: 'SRV6', label: 'SRV6', t: 'server', x: 90, y: 50 },
        ],
        links: [
          { a: 'PC6', b: 'R1', l: '2001:db8:a::/64' },
          { a: 'R1', b: 'R2', l: '::/64 ✗', fault: true },
          { a: 'R2', b: 'SRV6', l: '2001:db8:b::/64' },
        ],
      },
      connectivity(w, src, target) {
        if (src.id !== 'PC6' || target.toLowerCase() !== '2001:db8:b::50') return { ok: false, reason: 'timeout' };
        const r1 = dev(w, 'R1');
        const okRoute = r1.ipv6Routing && (r1.ipv6Routes || []).some((r) => r.net === '2001:db8:b::' && r.prefix === 64);
        return okRoute ? { ok: true, ttl: 126, path: ['2001:db8:a::1', '2001:db8:12::2', target] } : { ok: false, reason: 'net-unreachable' };
      },
    });

    /* ================= ENSA · GESTÃO DE REDE ================= */
    X.push({
      id: 'm15', code: 'NOA-206', title: 'O Tempo Não Mente', place: 'SOC NetDefend', act: 'ENSA',
      xp: 260, badge: 'Sentinela do SOC', difficulty: 2,
      concepts: ['NTP', 'Syslog', 'SNMP', 'Gestão de rede'],
      symptom: 'Os logs do router chegam ao SOC com horas erradas e a monitorização SNMP não recebe dados.',
      briefing:
        'Numa investigação de incidente, os timestamps dos logs do R-MGMT não batem certo — impossível correlacionar ' +
        'eventos. Além disso, a plataforma de monitorização não consegue ler o equipamento. Falta a tríade de gestão: ' +
        'NTP (relógio sincronizado), Syslog (envio de logs para o coletor) e SNMP (monitorização). Configure as três.',
      intel: [
        'Servidor NTP do SOC: 10.0.0.10.',
        'Coletor Syslog do SOC: 10.0.0.20.',
        'Comunidade SNMP de leitura desejada: NetDefend-RO (RO).',
        'Esta missão é de conformidade — valida-se pela configuração, não por ping.',
      ],
      hints: [
        'NTP: `ntp server 10.0.0.10`.',
        'Syslog: `logging host 10.0.0.20`.',
        'SNMP: `snmp-server community NetDefend-RO RO`.',
      ],
      guided: [
        'show ntp status',
        'configure terminal',
        'ntp server 10.0.0.10',
        'logging host 10.0.0.20',
        'logging trap informational',
        'snmp-server community NetDefend-RO RO',
        'snmp-server location SOC-NetDefend',
        'snmp-server contact noc@netdefend.pt',
        'end',
        'show ntp associations',
      ],
      debrief:
        'Sem tempo sincronizado, logs são inúteis para correlação forense — por isso o NTP vem primeiro. O Syslog ' +
        'passou a enviar eventos para o coletor central do SOC, e a comunidade SNMP RO permitiu à plataforma ler ' +
        'estado do equipamento sem poder alterá-lo. NTP + Syslog + SNMP são a base da observabilidade de rede.',
      world() {
        return {
          devices: [
            { id: 'R-MGMT', name: 'R-MGMT', type: 'router', ipRouting: true,
              interfaces: [
                { name: 'gi0/0', connected: true, adminUp: true, ip: '10.0.0.1', mask: '255.255.255.0', isSwitchport: false },
              ] },
          ],
        };
      },
      objectives: [
        { id: 'o1', text: 'Inspecionar o estado de gestão (show ntp status)', check: () => true, auto: 'inspect' },
        { id: 'o2', text: 'Configurar o servidor NTP 10.0.0.10', check: (w) => (dev(w, 'R-MGMT').ntp.servers || []).includes('10.0.0.10') },
        { id: 'o3', text: 'Enviar logs para o Syslog 10.0.0.20', check: (w) => (dev(w, 'R-MGMT').logging.hosts || []).includes('10.0.0.20') },
        { id: 'o4', text: 'Criar a comunidade SNMP NetDefend-RO (RO)', check: (w) => (dev(w, 'R-MGMT').snmp.communities || []).some((c) => c.name === 'NetDefend-RO' && c.access === 'RO') },
      ],
      topology: {
        nodes: [
          { id: 'R-MGMT', label: 'R-MGMT', t: 'router', x: 50, y: 28 },
          { id: 'NTP', label: 'NTP/Syslog/SNMP', t: 'server', x: 50, y: 78 },
        ],
        links: [
          { a: 'R-MGMT', b: 'NTP', l: '10.0.0.0/24 ✗', fault: true },
        ],
      },
      connectivity() { return { ok: false, reason: 'timeout' }; },
    });

    /* ================= ENSA · QoS ================= */
    X.push({
      id: 'm16', code: 'NOA-207', title: 'A Voz Cortada', place: 'WAN Corporativa', act: 'ENSA',
      xp: 320, badge: 'Maestra do QoS', difficulty: 3,
      concepts: ['QoS', 'class-map', 'policy-map', 'service-policy', 'VoIP'],
      symptom: 'Quando o link WAN satura, as chamadas VoIP cortam e ficam robóticas, enquanto downloads continuam.',
      briefing:
        'O link WAN do R-WAN é partilhado por voz e dados. Sob congestão, a voz (sensível a atraso/jitter) é a ' +
        'primeira a sofrer porque tudo compete em igualdade. A solução é QoS: classificar o tráfego de voz numa ' +
        'class-map, dar-lhe tratamento prioritário numa policy-map, e aplicar essa política à saída da interface WAN.',
      intel: [
        'Voz marcada com DSCP EF (Expedited Forwarding).',
        'Modelo: class-map identifica → policy-map decide → service-policy aplica.',
        'A política deve ser aplicada na SAÍDA (output) da Serial WAN.',
        'Missão de conformidade — valida-se pela configuração QoS.',
      ],
      hints: [
        'Classifique: `class-map match-any VOZ` e dentro `match dscp ef`.',
        'Priorize: `policy-map WAN-OUT` → `class VOZ` → `priority percent 30`.',
        'Aplique na Serial: `service-policy output WAN-OUT`.',
      ],
      guided: [
        'show policy-map',
        'configure terminal',
        'class-map match-any VOZ',
        'match dscp ef',
        'exit',
        'policy-map WAN-OUT',
        'class VOZ',
        'priority percent 30',
        'exit',
        'exit',
        'interface se0/0/0',
        'service-policy output WAN-OUT',
        'end',
        'show policy-map',
      ],
      debrief:
        'A voz cortava porque competia em igualdade com os downloads. Com QoS, a class-map VOZ identificou o ' +
        'tráfego EF, a policy-map WAN-OUT reservou-lhe largura de banda prioritária, e o service-policy output ' +
        'aplicou tudo à saída do link congestionado. Resultado: a voz passa à frente e deixa de cortar. ' +
        'Classificar → marcar → priorizar → aplicar: o ciclo do QoS.',
      world() {
        return {
          devices: [
            { id: 'R-WAN', name: 'R-WAN', type: 'router', ipRouting: true,
              interfaces: [
                { name: 'gi0/0', connected: true, adminUp: true, ip: '192.168.1.1', mask: '255.255.255.0', isSwitchport: false },
                { name: 'se0/0/0', connected: true, adminUp: true, ip: '203.0.113.1', mask: '255.255.255.252', isSwitchport: false },
              ] },
          ],
        };
      },
      objectives: [
        { id: 'o1', text: 'Inspecionar políticas QoS (show policy-map)', check: () => true, auto: 'inspect' },
        { id: 'o2', text: 'Criar a class-map VOZ a casar DSCP EF', check: (w) => { const cm = dev(w, 'R-WAN').qos.classMaps['VOZ']; return !!cm && cm.matches.some((m) => /dscp\s+ef/i.test(m)); } },
        { id: 'o3', text: 'Criar policy-map WAN-OUT com prioridade para VOZ', check: (w) => { const pm = dev(w, 'R-WAN').qos.policyMaps['WAN-OUT']; if (!pm) return false; const c = pm.classes.find((x) => x.name === 'VOZ'); return !!c && c.actions.some((a) => /priority/i.test(a)); } },
        { id: 'o4', text: 'Aplicar service-policy output na Serial WAN', check: (w) => { const sp = iface(w, 'R-WAN', 'se0/0/0').servicePolicy; return !!sp && sp.out === 'WAN-OUT'; } },
      ],
      topology: {
        nodes: [
          { id: 'R-WAN', label: 'R-WAN', t: 'router', x: 30, y: 35 },
          { id: 'WAN', label: 'WAN / ISP', t: 'cloud', x: 75, y: 30 },
          { id: 'PHONE', label: 'VoIP', t: 'pc', x: 30, y: 80 },
        ],
        links: [
          { a: 'R-WAN', b: 'WAN', l: 'Se0/0/0 ✗', fault: true },
          { a: 'PHONE', b: 'R-WAN', l: 'Gi0/0' },
        ],
      },
      connectivity() { return { ok: false, reason: 'timeout' }; },
    });

    /* ================= ENSA · VPN / IPsec ================= */
    X.push({
      id: 'm17', code: 'NOA-208', title: 'O Túnel Secreto', place: 'WAN Corporativa', act: 'ENSA',
      xp: 380, badge: 'Engenheira de VPN', difficulty: 4,
      concepts: ['VPN', 'IPsec', 'ISAKMP/IKE', 'Crypto map', 'Transform-set'],
      symptom: 'A filial precisa de falar com a sede de forma segura pela Internet, mas não há túnel — tráfego em claro.',
      briefing:
        'A NetDefend quer uma VPN site-to-site IPsec entre a sede (R-HQ) e a filial, sobre a Internet pública. ' +
        'Há várias peças a encaixar no R-HQ: uma política ISAKMP (fase 1), uma chave pré-partilhada para o peer, ' +
        'um transform-set (fase 2), e um crypto map que junta peer + transform-set + ACL de tráfego interessante, ' +
        'aplicado à interface externa. Só então o túnel sobe e o tráfego HQ↔Filial é cifrado.',
      intel: [
        'Peer (filial): 198.51.100.2. Rede HQ: 192.168.10.0/24 → Filial: 192.168.20.0/24.',
        'Fase 1 (ISAKMP): autenticação pre-share, encriptação AES, grupo DH 5.',
        'Fase 2 (IPsec): transform-set ESP-AES + ESP-SHA-HMAC.',
        'O crypto map liga tudo e tem de ser aplicado na interface de saída (Se0/0/0).',
      ],
      hints: [
        'Fase 1: `crypto isakmp policy 10` → `encryption aes` / `authentication pre-share` / `group 5`.',
        'Chave + transform-set: `crypto isakmp key ... address 198.51.100.2` e `crypto ipsec transform-set TS esp-aes esp-sha-hmac`.',
        'Crypto map: `set peer`, `set transform-set TS`, `match address 110`, depois aplique na Se0/0/0 com `crypto map VPN`.',
      ],
      guided: [
        'show crypto isakmp policy',
        'configure terminal',
        'crypto isakmp policy 10',
        'encryption aes',
        'authentication pre-share',
        'group 5',
        'exit',
        'crypto isakmp key NetDefendVPN address 198.51.100.2',
        'crypto ipsec transform-set TS esp-aes esp-sha-hmac',
        'access-list 110 permit ip 192.168.10.0 0.0.0.255 192.168.20.0 0.0.0.255',
        'crypto map VPN 10 ipsec-isakmp',
        'set peer 198.51.100.2',
        'set transform-set TS',
        'match address 110',
        'exit',
        'interface se0/0/0',
        'crypto map VPN',
        'end',
        '# muda para PC-HQ e testa:',
        'ping 192.168.20.10',
      ],
      debrief:
        'O túnel IPsec só sobe quando todas as peças encaixam: ISAKMP (fase 1) negoceia o canal seguro com ' +
        'pre-share + AES + DH; o transform-set (fase 2) define como cifrar os dados; a ACL diz QUE tráfego é ' +
        'interessante; e o crypto map cola peer + transform-set + ACL, ganhando vida ao ser aplicado à interface ' +
        'externa. Faltando uma peça, não há VPN. Agora HQ↔Filial viaja cifrado pela Internet.',
      world() {
        return {
          devices: [
            { id: 'R-HQ', name: 'R-HQ', type: 'router', ipRouting: true,
              interfaces: [
                { name: 'gi0/0', connected: true, adminUp: true, ip: '192.168.10.1', mask: '255.255.255.0', isSwitchport: false },
                { name: 'se0/0/0', connected: true, adminUp: true, ip: '198.51.100.1', mask: '255.255.255.252', isSwitchport: false },
              ] },
            { id: 'PC-HQ', name: 'PC-HQ', type: 'pc', ip: '192.168.10.10', mask: '255.255.255.0', gateway: '192.168.10.1' },
            { id: 'PC-FIL', name: 'PC-FILIAL', type: 'pc', ip: '192.168.20.10', mask: '255.255.255.0', gateway: '192.168.20.1' },
          ],
        };
      },
      objectives: [
        { id: 'o1', text: 'Inspecionar o estado IPsec (show crypto isakmp policy)', check: () => true, auto: 'inspect' },
        { id: 'o2', text: 'Definir política ISAKMP (pre-share + encriptação)', check: (w) => (dev(w, 'R-HQ').crypto.isakmp || []).some((p) => p.encryption && /pre-share/i.test(p.auth || '')) },
        { id: 'o3', text: 'Criar a chave PSK e o transform-set', check: (w) => { const c = dev(w, 'R-HQ').crypto; return !!c.psk && c.psk.peer === '198.51.100.2' && Object.keys(c.transformSets).length > 0; } },
        { id: 'o4', text: 'Configurar o crypto map (peer + transform-set + match address)', check: (w) => { const maps = dev(w, 'R-HQ').crypto.maps; const m = maps['VPN']; if (!m) return false; const e = m.entries[0]; return !!e && e.peer === '198.51.100.2' && !!e.transformSet && !!e.matchAcl; } },
        { id: 'o5', text: 'Aplicar o crypto map na interface externa (Se0/0/0)', check: (w) => iface(w, 'R-HQ', 'se0/0/0').cryptoMap === 'VPN' },
        { id: 'o6', text: 'Validar ping de PC-HQ para a filial (192.168.20.10)', check: (w) => w._pinged && w._pinged['PC-HQ->192.168.20.10'] },
      ],
      topology: {
        nodes: [
          { id: 'PC-HQ', label: 'PC-HQ', t: 'pc', x: 12, y: 35 },
          { id: 'R-HQ', label: 'R-HQ', t: 'router', x: 38, y: 30 },
          { id: 'WAN', label: 'INTERNET', t: 'cloud', x: 62, y: 22 },
          { id: 'PC-FIL', label: 'PC-FILIAL', t: 'pc', x: 88, y: 55 },
        ],
        links: [
          { a: 'PC-HQ', b: 'R-HQ', l: 'LAN HQ' },
          { a: 'R-HQ', b: 'WAN', l: 'IPsec ✗', fault: true },
          { a: 'WAN', b: 'PC-FIL', l: 'LAN Filial' },
        ],
      },
      connectivity(w, src, target) {
        if (src.id !== 'PC-HQ' || target !== '192.168.20.10') return { ok: false, reason: 'timeout' };
        const r = dev(w, 'R-HQ');
        const i = iface(w, 'R-HQ', 'se0/0/0');
        const map = r.crypto.maps['VPN'];
        const e = map && map.entries[0];
        const tunnelUp = i.cryptoMap === 'VPN' && e && e.peer === '198.51.100.2' && e.transformSet && e.matchAcl && r.crypto.psk;
        return tunnelUp ? { ok: true, ttl: 254, path: ['192.168.10.1', '[IPsec]', '192.168.20.10'] } : { ok: false, reason: 'net-unreachable' };
      },
    });

    /* ================= ENSA · AUTOMAÇÃO ================= */
    X.push({
      id: 'm18', code: 'NOA-209', title: 'O Robô Reparador', place: 'Centro de Automação', act: 'ENSA',
      xp: 360, badge: 'Engenheira DevNet', difficulty: 4,
      concepts: ['Automação', 'Ansible', 'JSON', 'REST API', 'Infra as Code'],
      symptom: 'Um deploy automático configurou o router de borda, mas a interface ficou em shutdown. A Internet caiu.',
      briefing:
        'A NetDefend gere a infraestrutura com Ansible (infra-as-code). O último deploy ao R-EDGE correu, mas uma ' +
        'variável ficou errada: a interface externa foi marcada como shutdown=true. Em vez de mexer no router à mão, ' +
        'corrige a variável no ficheiro de dados (host_vars.json) e volta a correr o playbook — a automação reaplica ' +
        'a config corrigida ao equipamento. Esta é a forma moderna de operar redes.',
      intel: [
        'Estás numa shell de automação (host de gestão), não no IOS.',
        'Comandos: `ls`, `cat <ficheiro>`, `set <chave> <valor>`, `ansible-playbook <yml>`.',
        'A variável errada está em edge.shutdown (deveria ser false).',
        'Depois do deploy, o PC-EDGE deve alcançar 203.0.113.50.',
      ],
      hints: [
        'Vê o estado: `cat host_vars.json`.',
        'Corrige: `set edge.shutdown false`.',
        'Reaplica: `ansible-playbook deploy.yml` e depois testa o ping no PC-EDGE.',
      ],
      guided: [
        'ls',
        'cat host_vars.json',
        'set edge.shutdown false',
        'cat host_vars.json',
        'ansible-playbook deploy.yml',
        '# muda para PC-EDGE e testa:',
        'ping 203.0.113.50',
      ],
      debrief:
        'Em vez de "consertar" o router manualmente, corrigiste a fonte da verdade (a variável no host_vars) e ' +
        'deixaste o Ansible reaplicar — idempotente, auditável e repetível. O playbook trouxe a interface de volta ' +
        '(no shutdown) e a borda voltou online. É assim que se opera rede à escala: declara-se o estado desejado ' +
        'em código e a automação garante que a realidade lhe corresponde.',
      world() {
        return {
          devices: [
            { id: 'AUTO-HOST', name: 'netops@auto', type: 'automation',
              auto: {
                pushed: false,
                data: { edge: { iface: 'g0/0', ip: '203.0.113.1', mask: '255.255.255.0', shutdown: true } },
                files: {
                  'host_vars.json': { type: 'json' },
                  'deploy.yml': { type: 'yaml', content:
                    '- name: Configurar borda\n  hosts: r-edge\n  tasks:\n    - name: Aplicar interface\n      ios_config:\n        lines:\n          - ip address {{ edge.ip }} {{ edge.mask }}\n        parents: interface {{ edge.iface }}\n    - name: Estado administrativo\n      ios_interfaces:\n        name: "{{ edge.iface }}"\n        enabled: "{{ not edge.shutdown }}"' },
                },
                run(data, world) {
                  if (data && data.edge && data.edge.shutdown === false) {
                    return {
                      ok: true,
                      out: '\nPLAY [Configurar borda] ******\n\nTASK [Aplicar interface] ok: [r-edge]\nTASK [Estado administrativo] changed: [r-edge]\n\nPLAY RECAP ******\nr-edge : ok=2 changed=1 failed=0\n',
                      apply(w) {
                        const r = w.devices['R-EDGE'];
                        if (r) { const it = r.interfaces[norm('g0/0')]; if (it) { it.adminUp = true; it.connected = true; } E.recompute(r); }
                        w._deployed = true;
                      },
                    };
                  }
                  return { ok: false, out: '\nTASK [Estado administrativo] FAILED: edge.shutdown ainda é true → interface continua em shutdown.\nr-edge : ok=1 changed=0 failed=1\n' };
                },
              },
            },
            { id: 'R-EDGE', name: 'R-EDGE', type: 'router', ipRouting: true,
              interfaces: [
                { name: 'g0/0', connected: false, adminUp: false, ip: '203.0.113.1', mask: '255.255.255.0', isSwitchport: false },
                { name: 'g0/1', connected: true, adminUp: true, ip: '192.168.99.1', mask: '255.255.255.0', isSwitchport: false },
              ] },
            { id: 'PC-EDGE', name: 'PC-EDGE', type: 'pc', ip: '192.168.99.10', mask: '255.255.255.0', gateway: '192.168.99.1' },
          ],
        };
      },
      objectives: [
        { id: 'o1', text: 'Ler as variáveis do deploy (cat host_vars.json)', check: () => true, auto: 'inspect' },
        { id: 'o2', text: 'Corrigir edge.shutdown para false', check: (w) => { const a = dev(w, 'AUTO-HOST').auto; return a && a.data.edge.shutdown === false; } },
        { id: 'o3', text: 'Executar o playbook (ansible-playbook)', check: (w) => { const a = dev(w, 'AUTO-HOST').auto; return a && a.pushed === true; } },
        { id: 'o4', text: 'Validar ping de PC-EDGE para 203.0.113.50', check: (w) => w._pinged && w._pinged['PC-EDGE->203.0.113.50'] },
      ],
      topology: {
        nodes: [
          { id: 'AUTO-HOST', label: 'Automação', t: 'automation', x: 18, y: 30 },
          { id: 'R-EDGE', label: 'R-EDGE', t: 'router', x: 50, y: 30 },
          { id: 'PC-EDGE', label: 'PC-EDGE', t: 'pc', x: 50, y: 80 },
          { id: 'NET', label: 'Internet', t: 'cloud', x: 85, y: 24 },
        ],
        links: [
          { a: 'AUTO-HOST', b: 'R-EDGE', l: 'SSH/API' },
          { a: 'R-EDGE', b: 'NET', l: 'G0/0 ✗', fault: true },
          { a: 'R-EDGE', b: 'PC-EDGE', l: 'G0/1' },
        ],
      },
      connectivity(w, src, target) {
        if (src.id !== 'PC-EDGE' || target !== '203.0.113.50') return { ok: false, reason: 'timeout' };
        return w._deployed ? { ok: true, ttl: 117, path: ['192.168.99.1', '203.0.113.1', target] } : { ok: false, reason: 'net-unreachable' };
      },
    });


    /* ================= ENSA · OSPF MULTIÁREA ================= */
    X.push({
      id: 'm19', code: 'NOA-210', title: 'A Área Esquecida', place: 'Filial Norte', act: 'ENSA',
      xp: 360, badge: 'Especialista em OSPF Multiárea', difficulty: 4,
      concepts: ['OSPF Multiárea', 'Área 0', 'Área 1', 'ABR', 'LSA', 'Sumarização'],
      symptom: 'A nova área 1 foi criada, mas a rede 10.2.0.0/30 não aparece no OSPF. A filial não alcança a sede.',
      briefing:
        'A empresa cresceu e o OSPF deixou de ser apenas single-area. O router R-ABR liga a área backbone 0 à área 1. ' +
        'Se a interface da área 1 não for anunciada no processo OSPF, os LSAs não atravessam o ABR e a topologia fica incompleta. ' +
        'A sua missão é ativar corretamente a rede da área 1 e validar a rota.',
      intel: [
        'R-ABR já tem OSPF processo 10 na área 0.',
        'A interface Gi0/1 usa 10.2.0.1/30 e deve pertencer à área 1.',
        'Depois da correção, PC-AREA1 deve alcançar 10.0.0.10.',
      ],
      hints: [
        'Use `show ip protocols` para ver quais redes estão no OSPF.',
        'Entre em `router ospf 10` e anuncie 10.2.0.0 0.0.0.3 area 1.',
        'Valide com `show ip route` e ping a partir do PC-AREA1.',
      ],
      guided: ['enable','configure terminal','router ospf 10','network 10.2.0.0 0.0.0.3 area 1','end','show ip protocols','ping 10.0.0.10'],
      debrief:
        'No OSPF multiárea, a área 0 é o backbone. O router que toca área 0 e outra área é um ABR. ' +
        'Ao anunciar a rede 10.2.0.0/30 na área 1, o ABR passa a gerar/propagar LSAs corretamente e a filial volta a aprender os caminhos.',
      world() { return { devices: [
        { id:'R-ABR', name:'R-ABR', type:'router', ipRouting:true,
          interfaces:[
            { name:'g0/0', connected:true, adminUp:true, ip:'10.0.0.1', mask:'255.255.255.252', isSwitchport:false },
            { name:'g0/1', connected:true, adminUp:true, ip:'10.2.0.1', mask:'255.255.255.252', isSwitchport:false },
          ], ospf:{ pid:10, networks:[{net:'10.0.0.0', wild:'0.0.0.3', area:0}], passive:[], routerId:'1.1.1.1' }, meta:{ gateway:'10.0.0.2' } },
        { id:'PC-AREA1', name:'PC-AREA1', type:'pc', ip:'10.2.0.2', mask:'255.255.255.252', gateway:'10.2.0.1' },
        { id:'SRV-HQ', name:'SRV-HQ', type:'server', ip:'10.0.0.10', mask:'255.255.255.0' },
      ]}; },
      objectives: [
        { id:'o1', text:'Inspecionar o processo OSPF atual', check:()=>true, auto:'inspect' },
        { id:'o2', text:'Anunciar 10.2.0.0/30 na área 1', check:(w)=> (dev(w,'R-ABR').ospf.networks||[]).some(n=>n.net==='10.2.0.0' && n.wild==='0.0.0.3' && Number(n.area)===1) },
        { id:'o3', text:'Validar ping de PC-AREA1 para 10.0.0.10', check:(w)=> w._pinged && w._pinged['PC-AREA1->10.0.0.10'] },
      ],
      topology:{ nodes:[{id:'SRV-HQ',label:'Sede',t:'server',x:15,y:50},{id:'R-ABR',label:'R-ABR',t:'router',x:50,y:50},{id:'PC-AREA1',label:'Área 1',t:'pc',x:85,y:50}], links:[{a:'SRV-HQ',b:'R-ABR',l:'Área 0'},{a:'R-ABR',b:'PC-AREA1',l:'Área 1 ✗',fault:true}] },
      evaluate(w){ const r=dev(w,'R-ABR'); const ok=(r.ospf.networks||[]).some(n=>n.net==='10.2.0.0' && Number(n.area)===1); r.meta.learnedRoutes = ok ? [{kind:'O',net:'10.0.0.0',mask:'255.255.255.0',nh:'10.0.0.2',iface:'GigabitEthernet0/0',metric:20}] : []; },
      connectivity(w,src,target){ const ok=(dev(w,'R-ABR').ospf.networks||[]).some(n=>n.net==='10.2.0.0' && Number(n.area)===1); return (src.id==='PC-AREA1' && target==='10.0.0.10' && ok) ? {ok:true,ttl:126,path:['10.2.0.1','10.0.0.10']} : {ok:false,reason:'net-unreachable'}; }
    });

    /* ================= SRWE · SLAAC / DHCPv6 ================= */
    X.push({
      id: 'm20', code: 'NOA-110', title: 'O Endereço Sem Servidor', place: 'Data Center', act: 'SRWE',
      xp: 320, badge: 'Guardiã do IPv6 Dinâmico', difficulty: 3,
      concepts: ['SLAAC', 'DHCPv6', 'Router Advertisement', 'EUI-64', 'IPv6 Default Gateway'],
      symptom: 'Os clientes IPv6 não recebem gateway por Router Advertisement. O segmento deveria operar com SLAAC.',
      briefing:
        'No IPv6, o host pode formar endereço automaticamente com SLAAC a partir dos Router Advertisements. ' +
        'Mas o router precisa ter roteamento IPv6 ativo e endereço global na interface LAN. Configure a interface com EUI-64 e habilite o roteamento IPv6.',
      intel: ['Segmento LAN: 2001:db8:40::/64.', 'Interface LAN do R6: Gi0/0.', 'PC6 deve alcançar 2001:db8:40::100.'],
      hints: ['Ative `ipv6 unicast-routing` no modo global.', 'Na interface Gi0/0 use `ipv6 address 2001:db8:40::1/64 eui-64`.', 'Teste com ping IPv6.'],
      guided: ['enable','configure terminal','ipv6 unicast-routing','interface g0/0','ipv6 address 2001:db8:40::1/64 eui-64','no shutdown','end','show ipv6 interface brief','ping 2001:db8:40::100'],
      debrief:
        'SLAAC depende dos Router Advertisements. Em Cisco IOS, `ipv6 unicast-routing` permite ao router anunciar prefixos, e o endereço da interface define o prefixo local. DHCPv6 pode complementar DNS/outros parâmetros, mas SLAAC resolve o endereçamento básico.',
      world(){ return { devices:[
        { id:'R6', name:'R6', type:'router', interfaces:[{name:'g0/0',connected:true,adminUp:true,isSwitchport:false}] },
        { id:'PC6', name:'PC6', type:'pc', ip:'2001:db8:40::10', mask:'64', gateway:'2001:db8:40::1' },
        { id:'SRV6', name:'SRV6', type:'server', ip:'2001:db8:40::100', mask:'64' },
      ]}; },
      objectives:[
        {id:'o1',text:'Ativar ipv6 unicast-routing',check:(w)=>dev(w,'R6').ipv6Routing===true},
        {id:'o2',text:'Configurar endereço IPv6 /64 com EUI-64 na LAN',check:(w)=> (iface(w,'R6','g0/0').ipv6||[]).some(a=>a.addr==='2001:db8:40::1' && Number(a.prefix)===64 && a.eui)},
        {id:'o3',text:'Validar ping de PC6 para 2001:db8:40::100',check:(w)=>w._pinged && w._pinged['PC6->2001:db8:40::100']},
      ],
      topology:{nodes:[{id:'PC6',label:'PC6',t:'pc',x:20,y:60},{id:'R6',label:'R6',t:'router',x:50,y:50},{id:'SRV6',label:'SRV6',t:'server',x:82,y:50}],links:[{a:'PC6',b:'R6',l:'RA/SLAAC ✗',fault:true},{a:'R6',b:'SRV6',l:'IPv6'}]},
      connectivity(w,src,target){ const r=dev(w,'R6'); const ok=r.ipv6Routing && (iface(w,'R6','g0/0').ipv6||[]).length; return (src.id==='PC6' && target==='2001:db8:40::100' && ok)?{ok:true,ttl:64,path:['2001:db8:40::1',target]}:{ok:false,reason:'net-unreachable'}; }
    });

    /* ================= ENSA · SSH / HARDENING ================= */
    X.push({
      id: 'm21', code: 'NOA-211', title: 'Telnet Nunca Mais', place: 'SOC NetDefend', act: 'ENSA',
      xp: 300, badge: 'Guardião do Acesso Seguro', difficulty: 3,
      concepts: ['SSH', 'Telnet inseguro', 'RSA keys', 'login local', 'VTY', 'Hardening'],
      symptom: 'A administração remota ainda aceita Telnet. Credenciais passam em claro pela rede.',
      briefing:
        'Em ambiente empresarial, Telnet deve ser eliminado. O router precisa de domínio, usuário local, chaves RSA, SSH v2 e VTY aceitando apenas SSH com login local.',
      intel: ['Router: R-SEC.', 'Domínio: netdefend.local.', 'Usuário local: admin.', 'Transport VTY deve ser somente ssh.'],
      hints: ['Configure `ip domain-name netdefend.local`.', 'Crie usuário local e gere chaves RSA.', 'Em `line vty 0 4`, use `login local` e `transport input ssh`.'],
      guided: ['enable','configure terminal','ip domain-name netdefend.local','username admin secret C1sc0!','crypto key generate rsa','ip ssh version 2','line vty 0 4','login local','transport input ssh','end','show ip ssh'],
      debrief:'O acesso administrativo seguro exige criptografia e autenticação local/centralizada. SSH v2 substitui Telnet, protegendo credenciais e sessão de gestão.',
      world(){ return { devices:[{id:'R-SEC',name:'R-SEC',type:'router',interfaces:[{name:'g0/0',connected:true,adminUp:true,ip:'192.168.50.1',mask:'255.255.255.0',isSwitchport:false}]}]}; },
      objectives:[
        {id:'o1',text:'Definir domínio do equipamento',check:(w)=>dev(w,'R-SEC').security.domainName==='netdefend.local'},
        {id:'o2',text:'Criar usuário local admin',check:(w)=>dev(w,'R-SEC').security.users.some(u=>u.name==='admin')},
        {id:'o3',text:'Gerar chaves RSA e ativar SSH versão 2',check:(w)=>dev(w,'R-SEC').security.rsaGenerated && dev(w,'R-SEC').security.sshVersion==='2'},
        {id:'o4',text:'Configurar VTY com login local e somente SSH',check:(w)=>dev(w,'R-SEC').security.vty.loginLocal && dev(w,'R-SEC').security.vty.transport==='ssh'},
      ],
      topology:{nodes:[{id:'ADMIN',label:'Admin',t:'pc',x:20,y:60},{id:'R-SEC',label:'R-SEC',t:'router',x:55,y:50},{id:'SOC',label:'SOC',t:'server',x:85,y:50}],links:[{a:'ADMIN',b:'R-SEC',l:'Telnet ✗',fault:true},{a:'R-SEC',b:'SOC',l:'Gestão'}]},
      connectivity(){return {ok:false,reason:'timeout'};}
    });

    /* ================= ENSA · SDN / REST / JSON ================= */
    X.push({
      id: 'm22', code: 'NOA-212', title: 'A Controladora Muda', place: 'Centro de Automação', act: 'ENSA',
      xp: 380, badge: 'Operadora SDN', difficulty: 4,
      concepts: ['SDN', 'Controller-based networking', 'REST API', 'JSON', 'Intent-based networking'],
      symptom: 'A controladora SDN recebeu uma intent errada: bloquear o tráfego do laboratório. É preciso corrigir a política via dados JSON.',
      briefing:
        'Em redes modernas, muitas mudanças não são feitas diretamente via CLI em cada equipamento, mas por API em uma controladora. ' +
        'Aqui você corrige uma intent em JSON e envia novamente para a controladora simulada.',
      intel:['Arquivo: intent.json.', 'Campo errado: policy.lab.allowed está false.', 'Deve ficar true e depois ser aplicado com curl PUT.'],
      hints:['Use `cat intent.json`.', 'Corrija com `set policy.lab.allowed true`.', 'Aplique com `curl -X PUT /api/intent`.'],
      guided:['cat intent.json','set policy.lab.allowed true','curl -X PUT /api/intent','# mudar para PC-LAB','ping 10.30.0.100'],
      debrief:'SDN separa controle e encaminhamento. A controladora recebe intenções/políticas em dados estruturados, como JSON, e traduz isso em configuração nos equipamentos.',
      world(){return {devices:[
        {id:'CTRL',name:'sdn@controller',type:'automation',auto:{data:{policy:{lab:{allowed:false}}},files:{'intent.json':{type:'json'}},run(data,world){ if(data.policy.lab.allowed===true){return {ok:true,out:'HTTP/1.1 200 OK\n{ "intent": "accepted", "lab": "allowed" }',apply(w){w._sdnApplied=true;}}} return {ok:false,out:'HTTP/1.1 400 Bad Request\n{ "error": "lab still blocked" }'};}}},
        {id:'PC-LAB',name:'PC-LAB',type:'pc',ip:'10.30.0.10',mask:'255.255.255.0',gateway:'10.30.0.1'},
        {id:'APP-LAB',name:'APP-LAB',type:'server',ip:'10.30.0.100',mask:'255.255.255.0'},
      ]};},
      objectives:[
        {id:'o1',text:'Ler a intent JSON atual',check:()=>true,auto:'inspect'},
        {id:'o2',text:'Alterar policy.lab.allowed para true',check:(w)=>dev(w,'CTRL').auto.data.policy.lab.allowed===true},
        {id:'o3',text:'Aplicar a intent na controladora',check:(w)=>w._sdnApplied===true},
        {id:'o4',text:'Validar ping de PC-LAB para 10.30.0.100',check:(w)=>w._pinged && w._pinged['PC-LAB->10.30.0.100']},
      ],
      topology:{nodes:[{id:'CTRL',label:'Controller',t:'automation',x:50,y:20},{id:'PC-LAB',label:'PC-LAB',t:'pc',x:20,y:75},{id:'APP-LAB',label:'APP-LAB',t:'server',x:82,y:75}],links:[{a:'CTRL',b:'PC-LAB',l:'Intent ✗',fault:true},{a:'CTRL',b:'APP-LAB',l:'Policy'}]},
      connectivity(w,src,target){return (src.id==='PC-LAB'&&target==='10.30.0.100'&&w._sdnApplied)?{ok:true,ttl:64,path:['10.30.0.1',target]}:{ok:false,reason:'timeout'};}
    });

    return X;
  }

  const API = { buildExt };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.NOA_MISSIONS_EXT = API;
})(typeof window !== 'undefined' ? window : globalThis);

/* ===== app.js ===== */
/* ============================================================================
 * Network Ops Academy — App Controller (app.js)
 * Boot sequence, Cidade Digital map, 4-panel mission view, IOS terminal,
 * sandbox, XP/badges/achievements/stats progression.
 * Depends on: window.NOA_ENGINE (engine.js), window.NOA_MISSIONS (missions.js)
 * ==========================================================================*/
(function () {
  'use strict';
  var E = window.NOA_ENGINE;
  var MISSIONS = window.NOA_MISSIONS.build(E);
  var byId = {};
  MISSIONS.forEach(function (m) { byId[m.id] = m; });

  /* ---- storage (safe wrapper, in-memory fallback) ----------------------- */
  var Store = (function () {
    var mem = {};
    var ok = false;
    try {
      var k = '__noa_t';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      ok = true;
    } catch (e) { ok = false; }
    return {
      get: function (key) {
        try { return ok ? window.localStorage.getItem(key) : (mem[key] || null); }
        catch (e) { return mem[key] || null; }
      },
      set: function (key, val) {
        try { if (ok) window.localStorage.setItem(key, val); else mem[key] = val; }
        catch (e) { mem[key] = val; }
      },
    };
  })();

  /* ---- progression state ------------------------------------------------ */
  var DEFAULT_STATE = {
    xp: 0, completed: {}, badges: {}, achievements: {},
    best: {}, // mission id -> fewest commands used
    firstName: null,
  };
  var state = load();

  function load() {
    try {
      var raw = Store.get('noa_state');
      if (raw) return Object.assign({}, DEFAULT_STATE, JSON.parse(raw));
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
  function save() { Store.set('noa_state', JSON.stringify(state)); }

  function levelInfo(xp) {
    // tiers grow ~ each ~600xp
    var tiers = [
      { lvl: 1, name: 'Estagiária NOC', need: 0 },
      { lvl: 2, name: 'Analista Jr. de Redes', need: 350 },
      { lvl: 3, name: 'Analista de Redes', need: 800 },
      { lvl: 4, name: 'Engenheira de Redes', need: 1500 },
      { lvl: 5, name: 'Engenheira Sênior', need: 2400 },
      { lvl: 6, name: 'Arquiteta de Infraestrutura', need: 3600 },
      { lvl: 7, name: 'Lenda do SOC', need: 5200 },
    ];
    var cur = tiers[0], next = null;
    for (var i = 0; i < tiers.length; i++) {
      if (xp >= tiers[i].need) { cur = tiers[i]; next = tiers[i + 1] || null; }
    }
    var pct = next ? Math.round(((xp - cur.need) / (next.need - cur.need)) * 100) : 100;
    return { cur: cur, next: next, pct: pct };
  }

  // skill stats derived from completed missions' concepts
  function computeStats() {
    var s = { Switching: 0, Routing: 0, 'Segurança': 0, Troubleshooting: 0 };
    var max = { Switching: 0, Routing: 0, 'Segurança': 0, Troubleshooting: 0 };
    MISSIONS.forEach(function (m) {
      var cat = categoryOf(m);
      max[cat] += 1;
      max.Troubleshooting += 1;
      if (state.completed[m.id]) {
        s[cat] += 1;
        s.Troubleshooting += 1;
      }
    });
    var out = {};
    Object.keys(s).forEach(function (k) {
      out[k] = max[k] ? Math.round((s[k] / max[k]) * 100) : 0;
    });
    return out;
  }
  function categoryOf(m) {
    if (m.id === 'mF') return 'Segurança';
    var sec = ['m6', 'm9', 'm15', 'm17']; // port-security, ACL, gestão/SOC, VPN
    var route = ['m3', 'm7', 'm8', 'm10', 'm11', 'm13', 'm14', 'm16', 'm18']; // +HSRP, IPv6, QoS, automação
    if (sec.indexOf(m.id) >= 0) return 'Segurança';
    if (route.indexOf(m.id) >= 0) return 'Routing';
    return 'Switching';
  }

  /* ---- achievements ----------------------------------------------------- */
  var ACHIEVEMENTS = [
    { id: 'first_blood', name: 'Primeiro Chamado', desc: 'Resolva a sua primeira missão.', icon: '🎯',
      test: function () { return countCompleted() >= 1; } },
    { id: 'vlan_master', name: 'Mestre do SRWE', desc: 'Conclua todas as missões de SRWE (switching, wireless, IPv6, HSRP).', icon: '🔀',
      test: function () { return ['m1','m2','m3','m4','m5','m6','m12','m13','m14'].every(function (i) { return state.completed[i]; }); } },
    { id: 'route_eng', name: 'Engenheira do ENSA', desc: 'Conclua todas as missões de ENSA (OSPF, NAT, ACL, QoS, VPN, automação).', icon: '🛰️',
      test: function () { return ['m7','m8','m9','m10','m11','m15','m16','m17','m18'].every(function (i) { return state.completed[i]; }); } },
    { id: 'detective', name: 'Detetive de Redes', desc: 'Resolva uma missão usando 3 comandos de config ou menos.', icon: '🔎',
      test: function () { return Object.keys(state.best).some(function (k) { return state.best[k] <= 3; }); } },
    { id: 'wireless_pro', name: 'Domadora de Wi-Fi', desc: 'Coloque a WLAN corporativa no ar.', icon: '🛜',
      test: function () { return !!state.completed.m12; } },
    { id: 'vpn_specialist', name: 'Guardiã dos Túneis', desc: 'Estabeleça a VPN IPsec site-to-site.', icon: '🔐',
      test: function () { return !!state.completed.m17; } },
    { id: 'devnet', name: 'Engenheira DevNet', desc: 'Repare a rede via automação (Ansible).', icon: '🤖',
      test: function () { return !!state.completed.m18; } },
    { id: 'architect', name: 'Arquiteta de Infraestrutura', desc: 'Vença o colapso final da NetDefend.', icon: '🏛️',
      test: function () { return !!state.completed.mF; } },
    { id: 'flawless', name: 'Operação Impecável', desc: 'Conclua 10 missões.', icon: '⭐',
      test: function () { return countCompleted() >= 10; } },
    { id: 'ccna_ready', name: 'Pronta para o CCNA', desc: 'Conclua TODAS as missões da academia.', icon: '🎓',
      test: function () { return MISSIONS.every(function (m) { return state.completed[m.id]; }); } },
  ];
  function countCompleted() { return Object.keys(state.completed).filter(function (k) { return state.completed[k]; }).length; }
  function refreshAchievements() {
    var unlocked = [];
    ACHIEVEMENTS.forEach(function (a) {
      if (!state.achievements[a.id] && a.test()) {
        state.achievements[a.id] = true;
        unlocked.push(a);
      }
    });
    if (unlocked.length) save();
    return unlocked;
  }

  /* ---- locations (Cidade Digital) -------------------------------------- */
  var LOCATIONS = [
    { id: 'academia', name: 'Academia NOC', sub: 'Treino & Onboarding', x: 50, y: 10, missions: [], intro: true, icon: 'academy' },
    { id: 'wifi', name: 'Campus Wi-Fi', sub: 'SRWE · WLAN', x: 10, y: 30, missions: ['m12'], icon: 'building' },
    { id: 'campus', name: 'Campus LAN', sub: 'SRWE · L2', x: 24, y: 24, missions: ['m1', 'm2'], icon: 'building' },
    { id: 'corp', name: 'Sede Corporativa', sub: 'Inter-VLAN · STP', x: 48, y: 28, missions: ['m3', 'm4'], icon: 'tower' },
    { id: 'datacenter', name: 'Data Center', sub: 'EtherChannel · IPv6', x: 76, y: 22, missions: ['m5', 'm14', 'm20'], icon: 'server' },
    { id: 'redundancia', name: 'Núcleo Redundante', sub: 'SRWE · HSRP', x: 34, y: 44, missions: ['m13'], icon: 'tower' },
    { id: 'soc', name: 'SOC NetDefend', sub: 'Segurança · Gestão', x: 84, y: 44, missions: ['m6', 'm15', 'm21'], icon: 'shield' },
    { id: 'norte', name: 'Filial Norte', sub: 'OSPF · WAN', x: 14, y: 56, missions: ['m7', 'm11', 'm19'], icon: 'branch' },
    { id: 'isp', name: 'Borda / ISP', sub: 'NAT · ACL', x: 48, y: 58, missions: ['m8', 'm9'], icon: 'cloud' },
    { id: 'wan', name: 'WAN Corporativa', sub: 'ENSA · QoS · VPN', x: 68, y: 64, missions: ['m16', 'm17'], icon: 'cloud' },
    { id: 'sul', name: 'Filial Sul', sub: 'DHCP Relay', x: 28, y: 80, missions: ['m10'], icon: 'branch' },
    { id: 'automacao', name: 'Centro de Automação', sub: 'ENSA · DevNet', x: 88, y: 78, missions: ['m18', 'm22'], icon: 'server' },
    { id: 'colapso', name: 'NetDefend HQ', sub: 'Incidente Crítico', x: 56, y: 82, missions: ['mF'], icon: 'alert', final: true },
  ];

  /* ---- DOM helpers ------------------------------------------------------ */
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  var root = document.getElementById('noa-root');

  /* ---- icons (inline svg) ---------------------------------------------- */
  function locIcon(kind) {
    var paths = {
      academy: '<path d="M3 9l9-5 9 5-9 5-9-5zm9 7l6-3.3V16l-6 3-6-3v-3.3L12 16z"/>',
      building: '<path d="M4 3h16v18H4zM8 7h2v2H8zm6 0h2v2h-2zM8 11h2v2H8zm6 0h2v2h-2zM8 15h2v2H8zm6 0h2v2h-2z"/>',
      tower: '<path d="M11 2h2v4h3l-2 4h2l-2 4h2l-3 8h-2l-3-8h2l-2-4h2L8 6h3z"/>',
      server: '<path d="M3 4h18v6H3zM3 14h18v6H3zM6 7h.01M6 17h.01"/>',
      shield: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/>',
      branch: '<path d="M5 3h14v8H5zM9 14h6v7H9zM12 11v3"/>',
      cloud: '<path d="M6 18a4 4 0 010-8 5 5 0 019.6-1.3A4 4 0 1117 18z"/>',
      alert: '<path d="M12 2l10 18H2zM12 9v5m0 3h.01"/>',
    };
    return '<svg viewBox="0 0 24 24" class="loc-svg">' + (paths[kind] || paths.building) + '</svg>';
  }
  function nodeIcon(t) {
    var p = {
      switch: '<rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M7 12h2m3 0h2m3 0h1"/>',
      router: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8M9 9l6 6M15 9l-6 6"/>',
      pc: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
      server: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M8 7h8M8 11h8M8 15h4"/>',
      cloud: '<path d="M6 18a4 4 0 010-8 5 5 0 019.6-1.3A4 4 0 1117 18z"/>',
      wlc: '<rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 16.5h.01"/><path d="M8 8a6 6 0 018 0M10.5 10.5a3 3 0 013 0M12 6V3"/>',
      automation: '<rect x="5" y="8" width="14" height="11" rx="2"/><path d="M9 13h.01M15 13h.01M9 16h6"/><path d="M12 8V5M9 5h6"/>',
    };
    return '<svg viewBox="0 0 24 24">' + (p[t] || p.pc) + '</svg>';
  }

  /* ====================================================================== *
   *  BOOT SEQUENCE
   * ====================================================================== */
  function runBoot() {
    var lines = [
      { t: 'NetDefend Solutions — Network Operations Center', c: 'b-head' },
      { t: 'BIOS v4.2.1 ... OK', c: '' },
      { t: 'Inicializando núcleo de simulação Cisco IOS .......... OK', c: '' },
      { t: 'Carregando topologias de rede [' + MISSIONS.length + ' cenários] ... OK', c: '' },
      { t: 'Montando motor de conectividade L2/L3 ............... OK', c: '' },
      { t: 'Calibrando sensores do SOC .......................... OK', c: '' },
      { t: 'Verificando credenciais de operador ................. OK', c: 'b-ok' },
      { t: '', c: '' },
      { t: '>> SISTEMA PRONTO. Bem-vinda ao Network Ops Academy.', c: 'b-ready' },
    ];
    clear(root);
    var skip = el('button', { class: 'boot-skip', onclick: function () { finishBoot(); } }, ['ignorar ▸']);
    var term = el('div', { class: 'boot-term' });
    var screen = el('div', { class: 'boot-screen' }, [
      el('div', { class: 'boot-logo', html: brandMark() }),
      term, skip,
    ]);
    root.appendChild(screen);
    var i = 0, done = false;
    function finishBoot() { if (done) return; done = true; showMap(true); }
    function next() {
      if (done) return;
      if (i >= lines.length) { setTimeout(finishBoot, 650); return; }
      var ln = lines[i++];
      var row = el('div', { class: 'boot-line ' + ln.c });
      term.appendChild(row);
      typeLine(row, ln.t, function () { setTimeout(next, ln.t ? 90 : 200); });
    }
    next();
  }
  function typeLine(node, text, cb) {
    if (!text) { node.innerHTML = '&nbsp;'; cb(); return; }
    var i = 0;
    var cur = el('span', { class: 'boot-cursor' });
    node.appendChild(cur);
    var speed = Math.max(6, 26 - text.length / 6);
    var iv = setInterval(function () {
      if (i >= text.length) { clearInterval(iv); if (cur.parentNode) cur.parentNode.removeChild(cur); cb(); return; }
      node.insertBefore(document.createTextNode(text[i++]), cur);
    }, speed);
  }
  function brandMark() {
    return '<svg viewBox="0 0 240 48" class="brand-svg">' +
      '<g fill="none" stroke="currentColor" stroke-width="2">' +
      '<circle cx="20" cy="24" r="10"/><path d="M20 14v20M10 24h20M13 17l14 14M27 17L13 31"/>' +
      '</g><text x="42" y="22" class="brand-t1">NETWORK OPS</text>' +
      '<text x="42" y="40" class="brand-t2">ACADEMY</text></svg>';
  }

  /* ====================================================================== *
   *  HUD (top bar)
   * ====================================================================== */
  function hud() {
    var li = levelInfo(state.xp);
    var bar = el('div', { class: 'hud' });
    var left = el('div', { class: 'hud-brand', html: brandMark(), onclick: function () { showMap(); } });
    var lvl = el('div', { class: 'hud-level' }, [
      el('div', { class: 'hud-lvl-row' }, [
        el('span', { class: 'hud-lvl-name', text: li.cur.name }),
        el('span', { class: 'hud-lvl-tag', text: 'Nv.' + li.cur.lvl }),
      ]),
      el('div', { class: 'hud-xpbar' }, [
        el('div', { class: 'hud-xpfill', style: 'width:' + li.pct + '%' }),
      ]),
      el('div', { class: 'hud-xp-text', text: state.xp + ' XP' + (li.next ? ' · próximo: ' + li.next.need + ' XP' : ' · MÁX') }),
    ]);
    var prog = el('div', { class: 'hud-prog' }, [
      pill('✅ ' + countCompleted() + '/' + MISSIONS.length, 'Missões'),
      pill('🏅 ' + Object.keys(state.badges).length, 'Insígnias'),
      pill('🏆 ' + Object.keys(state.achievements).length, 'Conquistas'),
    ]);
    var nav = el('div', { class: 'hud-nav' }, [
      el('button', { class: 'hud-btn', onclick: function () { showMap(); } }, ['🗺️ Mapa']),
      el('button', { class: 'hud-btn', onclick: function () { showSandbox(); } }, ['🧪 Laboratório']),
      el('button', { class: 'hud-btn', onclick: function () { showProfile(); } }, ['📊 Perfil']),
    ]);
    bar.appendChild(left); bar.appendChild(lvl); bar.appendChild(prog); bar.appendChild(nav);
    return bar;
  }
  function pill(big, small) {
    return el('div', { class: 'hud-pill' }, [
      el('div', { class: 'hud-pill-b', text: big }),
      el('div', { class: 'hud-pill-s', text: small }),
    ]);
  }

  /* ====================================================================== *
   *  MAP VIEW — Cidade Digital
   * ====================================================================== */
  function showMap(fade) {
    clear(root);
    var page = el('div', { class: 'page' + (fade ? ' fade-in' : '') });
    page.appendChild(hud());
    var wrap = el('div', { class: 'map-wrap' });
    var title = el('div', { class: 'map-head' }, [
      el('h1', { text: 'Cidade Digital' }),
      el('p', { text: 'A infraestrutura da NetDefend Solutions. Escolha um setor e resolva os incidentes para subir de nível.' }),
    ]);
    var grid = el('div', { class: 'map-canvas' });
    grid.innerHTML = mapGridSvg();
    // location nodes
    LOCATIONS.forEach(function (loc) {
      var total = loc.missions.length;
      var done = loc.missions.filter(function (id) { return state.completed[id]; }).length;
      var avail = loc.intro || loc.missions.some(function (id) { return isUnlocked(id); });
      var node = el('button', {
        class: 'loc' + (loc.final ? ' loc-final' : '') + (!avail ? ' loc-locked' : '') + (total && done === total ? ' loc-done' : ''),
        style: 'left:' + loc.x + '%;top:' + loc.y + '%',
        onclick: function () { if (loc.intro) showAcademy(); else showLocation(loc); },
      }, [
        el('span', { class: 'loc-icon', html: locIcon(loc.icon) }),
        el('span', { class: 'loc-name', text: loc.name }),
        el('span', { class: 'loc-sub', text: loc.sub }),
        total ? el('span', { class: 'loc-prog', text: done + '/' + total + (avail ? '' : ' 🔒') }) : el('span', { class: 'loc-prog', text: 'Início' }),
      ]);
      grid.appendChild(node);
    });
    wrap.appendChild(title);
    wrap.appendChild(grid);
    page.appendChild(wrap);
    root.appendChild(page);
    var unlocked = refreshAchievements();
    if (unlocked.length) toastAchievements(unlocked);
  }
  function mapGridSvg() {
    // decorative connection lines between locations
    var conns = [['academia','campus'],['academia','corp'],['academia','datacenter'],
      ['campus','corp'],['corp','datacenter'],['corp','isp'],['datacenter','soc'],
      ['campus','norte'],['norte','isp'],['isp','sul'],['soc','colapso'],['isp','colapso'],['sul','colapso']];
    var pos = {}; LOCATIONS.forEach(function (l) { pos[l.id] = l; });
    var lines = conns.map(function (c) {
      var a = pos[c[0]], b = pos[c[1]];
      return '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" />';
    }).join('');
    return '<svg class="map-grid" viewBox="0 0 100 100" preserveAspectRatio="none">' +
      '<g class="map-links">' + lines + '</g></svg>';
  }
  function isUnlocked(missionId) {
    var idx = MISSIONS.findIndex(function (m) { return m.id === missionId; });
    if (idx <= 0) return true;
    // unlock when previous mission done; final unlocks when all act missions done
    if (missionId === 'mF') {
      return MISSIONS.filter(function (m) { return m.id !== 'mF'; }).every(function (m) { return state.completed[m.id]; });
    }
    var prev = null;
    for (var pi = idx - 1; pi >= 0; pi--) { if (!MISSIONS[pi].final) { prev = MISSIONS[pi]; break; } }
    return !prev || !!state.completed[prev.id] || !!state.completed[missionId];
  }

  function showAcademy() {
    clear(root);
    var page = el('div', { class: 'page fade-in' });
    page.appendChild(hud());
    var card = el('div', { class: 'brief-card' }, [
      el('div', { class: 'brief-tag', text: 'ONBOARDING' }),
      el('h1', { text: 'Bem-vinda à NetDefend Solutions' }),
      el('p', { class: 'brief-lead', text: 'Você é a nova operadora do Centro de Operações de Rede (NOC). Seu trabalho: diagnosticar e corrigir incidentes reais de rede usando o terminal Cisco IOS — exatamente como em campo.' }),
      el('div', { class: 'academy-grid' }, [
        academyCard('1. Sintoma', 'Cada missão abre com um chamado: algo parou de funcionar.'),
        academyCard('2. Investigação', 'Use comandos show no terminal para coletar evidências.'),
        academyCard('3. Hipótese', 'Compare o estado real com o esperado e ache a causa-raiz.'),
        academyCard('4. Correção', 'Aplique a config certa e valide com ping/show.'),
        academyCard('5. Consolidação', 'O debrief explica o porquê — você aprende, não só conserta.'),
        academyCard('Dica', 'Em apuros? Cada missão tem pistas progressivas e comandos sugeridos.'),
      ]),
      el('div', { class: 'cmd-ref' }, [
        el('h3', { text: 'Comandos essenciais' }),
        el('div', { class: 'cmd-ref-grid', html:
          cmdRef('enable', 'entra no modo privilegiado') +
          cmdRef('configure terminal', 'modo de configuração') +
          cmdRef('show vlan brief', 'VLANs e portas') +
          cmdRef('show ip interface brief', 'status/IP das interfaces') +
          cmdRef('show ip route', 'tabela de rotas') +
          cmdRef('show running-config', 'configuração atual') +
          cmdRef('interface <id>', 'entra numa interface') +
          cmdRef('ping <ip>', 'testa conectividade (no PC)') +
          cmdRef('? / ↑ ↓', 'ajuda e histórico')
        }),
      ]),
      el('button', { class: 'btn-primary', onclick: function () { showMap(); } }, ['Ir para o mapa ▸']),
    ]);
    var wrap = el('div', { class: 'narrow' }, [card]);
    page.appendChild(wrap);
    root.appendChild(page);
  }
  function academyCard(h, p) {
    return el('div', { class: 'ac-card' }, [el('h4', { text: h }), el('p', { text: p })]);
  }
  function cmdRef(c, d) {
    return '<div class="cref"><code>' + esc(c) + '</code><span>' + esc(d) + '</span></div>';
  }

  /* ---- location detail (mission list) ---------------------------------- */
  function showLocation(loc) {
    clear(root);
    var page = el('div', { class: 'page fade-in' });
    page.appendChild(hud());
    var head = el('div', { class: 'loc-head' }, [
      el('button', { class: 'back', onclick: function () { showMap(); } }, ['◂ Mapa']),
      el('div', {}, [
        el('h1', { text: loc.name }),
        el('p', { text: loc.sub }),
      ]),
    ]);
    var list = el('div', { class: 'mission-list' });
    loc.missions.forEach(function (id) {
      var m = byId[id];
      var unlocked = isUnlocked(id);
      var done = state.completed[id];
      var card = el('button', {
        class: 'm-card' + (!unlocked ? ' m-locked' : '') + (done ? ' m-done' : '') + (m.final ? ' m-final' : ''),
        onclick: function () { if (unlocked) startMission(id); },
      }, [
        el('div', { class: 'm-card-top' }, [
          el('span', { class: 'm-code', text: m.code }),
          el('span', { class: 'm-xp', text: '+' + m.xp + ' XP' }),
        ]),
        el('h3', { text: m.title }),
        el('p', { class: 'm-symptom', text: m.symptom }),
        el('div', { class: 'm-card-foot' }, [
          el('span', { class: 'm-diff', html: diffDots(m.difficulty) }),
          el('span', { class: 'm-concepts', text: m.concepts.join(' · ') }),
          el('span', { class: 'm-status', text: done ? '✅ Resolvida' : (unlocked ? '▸ Iniciar' : '🔒 Bloqueada') }),
        ]),
      ]);
      list.appendChild(card);
    });
    page.appendChild(el('div', { class: 'narrow' }, [head, list]));
    root.appendChild(page);
  }
  function diffDots(n) {
    var s = '';
    for (var i = 1; i <= 5; i++) s += '<i class="dot' + (i <= n ? ' on' : '') + '"></i>';
    return s;
  }

  /* ====================================================================== *
   *  MISSION VIEW — 4 panels
   * ====================================================================== */
  var SESSION = null;
  function startMission(id) {
    var m = byId[id];
    var spec = m.world();
    spec.connectivity = m.connectivity;
    var world = E.buildWorld(spec);
    world._pinged = {};
    if (m.evaluate) m.evaluate(world);
    SESSION = {
      m: m, world: world,
      devId: firstConfigurable(world),
      history: [], histIdx: -1,
      cmdCount: 0, configCmds: 0,
      hintLevel: 0,
      tab: 'briefing',
      log: [],
      completed: false,
    };
    showBriefing();
  }
  function firstConfigurable(world) {
    var ids = Object.keys(world.devices);
    var net = ids.filter(function (i) { var t = world.devices[i].type; return t === 'switch' || t === 'router' || t === 'l3switch' || t === 'wlc' || t === 'automation'; });
    return (net[0] || ids[0]);
  }

  function showBriefing() {
    var m = SESSION.m;
    clear(root);
    var page = el('div', { class: 'page fade-in' });
    page.appendChild(hud());
    var card = el('div', { class: 'brief-card mission-brief' }, [
      el('div', { class: 'brief-row' }, [
        el('span', { class: 'brief-tag', text: m.code + ' · ' + m.act }),
        el('span', { class: 'brief-xp', text: '+' + m.xp + ' XP · ' + m.badge }),
      ]),
      el('h1', { text: m.title }),
      el('div', { class: 'symptom-box' }, [
        el('span', { class: 'sym-label', text: '⚠ SINTOMA' }),
        el('p', { text: m.symptom }),
      ]),
      el('p', { class: 'brief-lead', text: m.briefing }),
      el('div', { class: 'intel-box' }, [
        el('h3', { text: '📋 Intel inicial' }),
        el('ul', {}, m.intel.map(function (t) { return el('li', { text: t }); })),
      ]),
      el('div', { class: 'concepts-row' }, m.concepts.map(function (c) { return el('span', { class: 'concept-chip', text: c }); })),
      el('div', { class: 'brief-actions' }, [
        el('button', { class: 'back', onclick: function () { showMap(); } }, ['◂ Voltar']),
        el('button', { class: 'btn-primary', onclick: function () { showMissionConsole(); } }, ['Aceitar chamado ▸']),
      ]),
    ]);
    page.appendChild(el('div', { class: 'narrow' }, [card]));
    root.appendChild(page);
  }

  function showMissionConsole() {
    clear(root);
    var page = el('div', { class: 'page mission-page' });
    page.appendChild(hud());
    var bar = el('div', { class: 'mission-bar' }, [
      el('button', { class: 'back', onclick: function () { confirmLeave(); } }, ['◂ Sair']),
      el('div', { class: 'mb-title' }, [
        el('span', { class: 'mb-code', text: SESSION.m.code }),
        el('span', { class: 'mb-name', text: SESSION.m.title }),
      ]),
      el('button', { class: 'mb-brief', onclick: function () { showBriefing(); } }, ['ℹ Briefing']),
    ]);
    var grid = el('div', { class: 'panels' });
    grid.appendChild(panelTopology());
    grid.appendChild(panelCenter());
    grid.appendChild(panelInventory());
    page.appendChild(bar);
    page.appendChild(grid);
    root.appendChild(page);
    renderObjectives();
    renderTerminal();
    focusInput();
  }
  function confirmLeave() {
    if (SESSION && !SESSION.completed && SESSION.cmdCount > 0) {
      if (!window.confirm('Sair da missão? O progresso desta sessão será perdido.')) return;
    }
    showMap();
  }

  /* ---- panel 1: topology ---------------------------------------------- */
  function panelTopology() {
    var p = el('div', { class: 'panel panel-topo' });
    p.appendChild(panelHead('TOPOLOGIA', 'Estado físico da rede'));
    var body = el('div', { class: 'topo-body', id: 'topo-body' });
    p.appendChild(body);
    return p;
  }
  function renderTopology() {
    var body = document.getElementById('topo-body');
    if (!body) return;
    var topo = SESSION.m.topology;
    if (!topo) { body.innerHTML = '<div class="topo-empty">Topologia livre — sem diagrama.</div>'; return; }
    var w = SESSION.world;
    var svg = ['<svg viewBox="0 0 100 100" class="topo-svg" preserveAspectRatio="xMidYMid meet">'];
    // links
    svg.push('<g class="topo-links">');
    topo.links.forEach(function (lk) {
      var a = nodePos(topo, lk.a), b = nodePos(topo, lk.b);
      if (!a || !b) return;
      var up = linkUp(lk);
      var cls = 'tl' + (up ? ' up' : ' down') + (lk.fault && !up ? ' fault' : '');
      svg.push('<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" class="' + cls + '"/>');
      var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (lk.l) svg.push('<text x="' + mx + '" y="' + (my - 1) + '" class="tl-label">' + esc(lk.l) + '</text>');
    });
    svg.push('</g>');
    // nodes
    svg.push('<g class="topo-nodes">');
    topo.nodes.forEach(function (n) {
      var devOk = nodeHealthy(n);
      svg.push('<g class="tn ' + (devOk ? 'ok' : 'warn') + '" transform="translate(' + n.x + ',' + n.y + ')">');
      svg.push('<circle r="7" class="tn-bg"/>');
      svg.push('<g transform="translate(-4.2,-4.2) scale(0.35)" class="tn-ic">' + nodeIcon(n.t) + '</g>');
      svg.push('<text y="13" class="tn-label">' + esc(n.label) + '</text>');
      svg.push('</g>');
    });
    svg.push('</g></svg>');
    var legend = '<div class="topo-legend">' +
      '<span><i class="lg up"></i> enlace ativo</span>' +
      '<span><i class="lg down"></i> enlace inativo</span>' +
      '<span><i class="lg fault"></i> suspeito</span></div>';
    body.innerHTML = svg.join('') + legend;
  }
  function nodePos(topo, id) { return topo.nodes.find(function (n) { return n.id === id; }); }
  function linkUp(lk) {
    var w = SESSION.world;
    var da = w.devices[lk.a], db = w.devices[lk.b];
    function endUp(dev, label) {
      if (!dev) return true;
      if (dev.type === 'pc' || dev.type === 'server' || dev.type === 'cloud') return true;
      if (!label) return true;
      var name = E.normIface(label);
      var i = dev.interfaces[name];
      if (!i) {
        // maybe label belongs to other end; if device has any up port assume ok
        return true;
      }
      return i.status === 'up';
    }
    return endUp(da, lk.l) && endUp(db, lk.l);
  }
  function nodeHealthy(n) {
    var w = SESSION.world;
    var d = w.devices[n.id];
    if (!d) return true;
    if (d.type === 'pc' || d.type === 'server' || d.type === 'cloud') return true;
    var ifs = Object.keys(d.interfaces).map(function (k) { return d.interfaces[k]; });
    var cabled = ifs.filter(function (i) { return i.connected; });
    if (!cabled.length) return true;
    return cabled.some(function (i) { return i.status === 'up'; });
  }

  /* ---- panel 2: center (objectives + terminal) ------------------------ */
  function panelCenter() {
    var p = el('div', { class: 'panel panel-center' });
    // objectives
    var obj = el('div', { class: 'objectives' });
    obj.appendChild(panelHead('OBJETIVOS', 'Conclua todos para resolver o chamado', true));
    obj.appendChild(el('div', { class: 'obj-list', id: 'obj-list' }));
    obj.appendChild(el('div', { class: 'obj-progress', id: 'obj-progress' }));
    // terminal
    var term = el('div', { class: 'terminal' });
    var termHead = el('div', { class: 'term-head' }, [
      el('span', { class: 'term-dots', html: '<i></i><i></i><i></i>' }),
      el('span', { class: 'term-title', text: 'Console IOS' }),
      el('div', { class: 'dev-switch', id: 'dev-switch' }),
    ]);
    var out = el('div', { class: 'term-out', id: 'term-out' });
    var inputRow = el('div', { class: 'term-input-row' }, [
      el('span', { class: 'term-prompt', id: 'term-prompt', text: '>' }),
      el('input', { class: 'term-input', id: 'term-input', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off' }),
    ]);
    term.appendChild(termHead);
    term.appendChild(out);
    term.appendChild(inputRow);
    p.appendChild(obj);
    p.appendChild(term);
    return p;
  }

  /* ---- panel 3: inventory (tabs) -------------------------------------- */
  function panelInventory() {
    var p = el('div', { class: 'panel panel-inv' });
    p.appendChild(panelHead('CADERNO DE CAMPO', ''));
    var tabs = el('div', { class: 'inv-tabs' }, [
      invTab('briefing', '📋 Caso'),
      invTab('hints', '💡 Pistas'),
      invTab('guided', '⚡ Comandos'),
      invTab('concepts', '📚 Teoria'),
    ]);
    var content = el('div', { class: 'inv-content', id: 'inv-content' });
    p.appendChild(tabs);
    p.appendChild(content);
    setTimeout(function () { renderInvTab('briefing'); }, 0);
    return p;
  }
  function invTab(id, label) {
    return el('button', { class: 'inv-tab', 'data-tab': id, onclick: function () { renderInvTab(id); } }, [label]);
  }
  function renderInvTab(id) {
    SESSION.tab = id;
    document.querySelectorAll('.inv-tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === id);
    });
    var c = document.getElementById('inv-content');
    if (!c) return;
    clear(c);
    var m = SESSION.m;
    if (id === 'briefing') {
      c.appendChild(el('div', { class: 'inv-block' }, [
        el('h4', { text: '⚠ Sintoma' }),
        el('p', { text: m.symptom }),
        el('h4', { text: '📋 Intel' }),
        el('ul', { class: 'inv-ul' }, m.intel.map(function (t) { return el('li', { text: t }); })),
        el('h4', { text: '🎯 Briefing' }),
        el('p', { class: 'dim', text: m.briefing }),
      ]));
    } else if (id === 'hints') {
      var block = el('div', { class: 'inv-block' }, [el('h4', { text: '💡 Pistas progressivas' })]);
      m.hints.forEach(function (h, i) {
        if (i < SESSION.hintLevel) {
          block.appendChild(el('div', { class: 'hint-shown' }, [el('span', { class: 'hint-n', text: 'Pista ' + (i + 1) }), el('p', { text: h })]));
        }
      });
      if (SESSION.hintLevel < m.hints.length) {
        block.appendChild(el('button', { class: 'btn-ghost', onclick: function () { SESSION.hintLevel++; renderInvTab('hints'); } },
          ['Revelar pista ' + (SESSION.hintLevel + 1) + ' (de ' + m.hints.length + ')']));
      } else {
        block.appendChild(el('p', { class: 'dim', text: 'Todas as pistas reveladas. Se ainda travar, veja a aba Comandos.' }));
      }
      c.appendChild(block);
    } else if (id === 'guided') {
      var g = el('div', { class: 'inv-block' }, [
        el('h4', { text: '⚡ Comandos sugeridos' }),
        el('p', { class: 'dim', text: 'Clique para inserir no terminal. Seguir a sequência resolve o caso — mas tente raciocinar primeiro!' }),
      ]);
      var chips = el('div', { class: 'chip-wrap' });
      m.guided.forEach(function (cmd) {
        chips.appendChild(el('button', { class: 'chip', onclick: function () { insertCmd(cmd); } }, ['$ ' + cmd]));
      });
      g.appendChild(chips);
      c.appendChild(g);
    } else if (id === 'concepts') {
      c.appendChild(el('div', { class: 'inv-block' }, [
        el('h4', { text: '📚 Conceitos desta missão' }),
        el('div', { class: 'concepts-row' }, m.concepts.map(function (x) { return el('span', { class: 'concept-chip', text: x }); })),
        el('h4', { text: 'Por que isso importa' }),
        el('p', { class: 'dim', text: theoryFor(m) }),
      ]));
    }
  }
  function theoryFor(m) {
    var map = {
      m1: 'VLANs segmentam um switch em domínios de broadcast independentes. Dois dispositivos só trocam quadros em L2 se estiverem na mesma VLAN. Uma porta em VLAN errada isola o host silenciosamente.',
      m2: 'Um trunk 802.1Q transporta múltiplas VLANs num único enlace, marcando cada quadro com uma tag. Ambos os lados precisam ser trunk e concordar na native VLAN, senão as VLANs não atravessam.',
      m3: 'Roteamento inter-VLAN (router-on-a-stick) usa subinterfaces, uma por VLAN, cada uma com encapsulation dot1Q e um gateway IP. Sem a subinterface, a VLAN fica sem rota para fora.',
      m4: 'O Spanning Tree (STP) previne loops em L2 elegendo uma raiz e bloqueando caminhos redundantes. Uma raiz mal posicionada gera caminhos sub-ótimos; defina a raiz no switch de núcleo.',
      m5: 'EtherChannel agrega vários links físicos num lógico (Po). Os modos precisam ser compatíveis (LACP active/passive, PAgP desirable/auto, ou on/on). Incompatibilidade impede o bundle.',
      m6: 'Port Security limita os MACs por porta. Numa violação, a porta pode ir para err-disabled (shutdown). Configure maximum, sticky e a ação de violação adequada e reative a porta.',
      m7: 'OSPF descobre rotas dinamicamente via áreas. Cada rede diretamente conectada precisa ser anunciada com network/wildcard na área certa, senão o vizinho não aprende a rota.',
      m8: 'NAT/PAT traduz IPs privados para um IP público. As interfaces precisam ser marcadas como ip nat inside (LAN) e ip nat outside (WAN), além da ACL e do overload. Sem o outside, não há tradução.',
      m9: 'ACLs filtram tráfego por origem/destino. Wildcards definem o alcance: 0.0.0.255 cobre uma /24 inteira. Liberar só um host quando a regra deveria cobrir a sub-rede bloqueia o resto.',
      m10: 'DHCP Relay (ip helper-address) encaminha broadcasts de DHCP de uma sub-rede sem servidor até o servidor remoto. Sem o helper na interface do cliente, os pedidos morrem no roteador.',
      m11: 'Links WAN seriais sobem só com a interface administrativamente ativa e o protocolo de linha up. Uma interface em shutdown derruba a adjacência e isola a filial.',
      mF: 'Incidentes reais combinam várias falhas em camadas (L2, roteamento, NAT, segurança). A disciplina é isolar camada por camada: primeiro L2, depois L3/OSPF, depois borda/NAT, depois políticas.',
    };
    return map[m.id] || m.concepts.join(', ') + '.';
  }

  function panelHead(title, sub, withReset) {
    return el('div', { class: 'panel-head' }, [
      el('span', { class: 'ph-title', text: title }),
      sub ? el('span', { class: 'ph-sub', text: sub }) : null,
    ]);
  }

  /* ---- objectives render ---------------------------------------------- */
  function renderObjectives() {
    var list = document.getElementById('obj-list');
    if (!list) return;
    clear(list);
    var m = SESSION.m, w = SESSION.world;
    var done = 0;
    m.objectives.forEach(function (o) {
      var pass = false;
      try { pass = !!o.check(w); } catch (e) { pass = false; }
      if (pass) done++;
      list.appendChild(el('div', { class: 'obj' + (pass ? ' obj-done' : '') }, [
        el('span', { class: 'obj-check', text: pass ? '✓' : '' }),
        el('span', { class: 'obj-text', text: o.text }),
      ]));
    });
    var prog = document.getElementById('obj-progress');
    if (prog) {
      var pct = Math.round((done / m.objectives.length) * 100);
      prog.innerHTML = '<div class="obj-bar"><div class="obj-fill" style="width:' + pct + '%"></div></div>' +
        '<span class="obj-count">' + done + ' / ' + m.objectives.length + '</span>';
    }
    if (done === m.objectives.length && !SESSION.completed) {
      SESSION.completed = true;
      setTimeout(completeMission, 500);
    }
  }

  /* ---- terminal -------------------------------------------------------- */
  function renderTerminal() {
    renderDevSwitch();
    renderTopology();
    var out = document.getElementById('term-out');
    if (out && !out.dataset.init) {
      out.dataset.init = '1';
      printLine(out, banner(), 'sys');
    }
    updatePrompt();
    bindInput();
  }
  function banner() {
    var d = SESSION.world.devices[SESSION.devId];
    return 'Conectado a ' + (d.name || d.id) + ' (' + d.type + '). Digite "?" para ajuda, comandos show para investigar.';
  }
  function renderDevSwitch() {
    var box = document.getElementById('dev-switch');
    if (!box) return;
    clear(box);
    var w = SESSION.world;
    var ids = Object.keys(w.devices);
    var sel = el('select', { class: 'dev-select', onchange: function (e) { switchDevice(e.target.value); } });
    ids.forEach(function (id) {
      var d = w.devices[id];
      var label = (d.name || id) + ' · ' + d.type;
      var opt = el('option', { value: id, text: label });
      if (id === SESSION.devId) opt.selected = true;
      sel.appendChild(opt);
    });
    box.appendChild(el('span', { class: 'dev-label', text: 'dispositivo:' }));
    box.appendChild(sel);
  }
  function switchDevice(id) {
    SESSION.devId = id;
    var out = document.getElementById('term-out');
    printLine(out, '— sessão movida para ' + (SESSION.world.devices[id].name || id) + ' —', 'sys');
    updatePrompt();
    focusInput();
  }
  function updatePrompt() {
    var d = SESSION.world.devices[SESSION.devId];
    var p = document.getElementById('term-prompt');
    if (p) p.textContent = E.prompt(d);
  }
  var inputBound = false;
  function bindInput() {
    var inp = document.getElementById('term-input');
    if (!inp || inp.dataset.bound) return;
    inp.dataset.bound = '1';
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submitCmd(inp.value); inp.value = ''; }
      else if (e.key === 'ArrowUp') { e.preventDefault(); histNav(-1, inp); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); histNav(1, inp); }
    });
  }
  function histNav(dir, inp) {
    var h = SESSION.history;
    if (!h.length) return;
    if (SESSION.histIdx === -1) SESSION.histIdx = h.length;
    SESSION.histIdx = Math.max(0, Math.min(h.length, SESSION.histIdx + dir));
    inp.value = h[SESSION.histIdx] || '';
    setTimeout(function () { inp.setSelectionRange(inp.value.length, inp.value.length); }, 0);
  }
  function insertCmd(cmd) {
    var inp = document.getElementById('term-input');
    if (!inp) return;
    inp.value = cmd;
    focusInput();
  }
  function focusInput() { var inp = document.getElementById('term-input'); if (inp) inp.focus(); }

  function submitCmd(raw) {
    raw = (raw || '').trim();
    var out = document.getElementById('term-out');
    var d = SESSION.world.devices[SESSION.devId];
    printLine(out, E.prompt(d) + ' ' + raw, 'cmd');
    if (!raw) { return; }
    SESSION.history.push(raw);
    SESSION.histIdx = -1;
    if (raw === '?' ) {
      printLine(out, helpText(), 'sys');
      scrollOut(out); return;
    }
    if (raw === 'clear' || raw === 'cls') { clear(out); out.dataset.init = '1'; return; }

    // ping detection (PC/server source)
    var isPing = /^ping\s+/i.test(raw);
    var res = E.execute(SESSION.world, SESSION.devId, raw);

    SESSION.cmdCount++;
    if (isConfigCmd(raw)) SESSION.configCmds++;

    if (res && typeof res.out === 'string' && res.out.length) {
      printLine(out, res.out, res.ok === false ? 'err' : 'res');
    }

    // mark ping success for objectives
    if (isPing && res && res.ok !== false && /TTL|bytes from|Reply|!{3,}|Success rate is 100/i.test(res.out)) {
      var target = raw.replace(/^ping\s+/i, '').trim().split(/\s+/)[0];
      SESSION.world._pinged[SESSION.devId + '->' + target] = true;
      // also store by device name
      SESSION.world._pinged[(d.name || SESSION.devId) + '->' + target] = true;
    }

    // re-evaluate world + objectives
    if (SESSION.m.evaluate) { try { SESSION.m.evaluate(SESSION.world); } catch (e) {} }
    renderObjectives();
    renderTopology();
    updatePrompt();
    scrollOut(out);
  }
  function isConfigCmd(raw) {
    return !/^(show|ping|traceroute|tracert|ipconfig|arp|nslookup|enable|disable|configure|conf|end|exit|do|\?|clear|cls)\b/i.test(raw);
  }
  function helpText() {
    return [
      'AJUDA RÁPIDA',
      '  enable                          → modo privilegiado',
      '  configure terminal              → modo de configuração',
      '  interface <id>                  → entra numa interface (ex: interface gi0/1)',
      '  show vlan brief | show ip route | show ip interface brief',
      '  show interfaces trunk | show running-config | show ip ospf neighbor',
      '  ping <ip>   (a partir de um PC)  → testa conectividade',
      '  end / exit                      → sobe um nível de modo',
      '  ↑ / ↓  histórico   ·   clear  limpa a tela',
      'Use a aba "Comandos" para inserir comandos sugeridos com 1 clique.',
    ].join('\n');
  }

  function printLine(out, text, cls) {
    if (!out) return;
    String(text).split('\n').forEach(function (ln) {
      out.appendChild(el('div', { class: 'tline ' + (cls || ''), text: ln === '' ? ' ' : ln }));
    });
  }
  function scrollOut(out) { if (out) out.scrollTop = out.scrollHeight; }

  /* ---- mission completion --------------------------------------------- */
  function completeMission() {
    var m = SESSION.m;
    var firstTime = !state.completed[m.id];
    state.completed[m.id] = true;
    if (firstTime) state.xp += m.xp;
    if (m.badge) state.badges[m.badge] = true;
    var cc = SESSION.configCmds;
    if (state.best[m.id] === undefined || cc < state.best[m.id]) state.best[m.id] = cc;
    save();
    var unlocked = refreshAchievements();
    showDebrief(firstTime, unlocked);
  }
  function showDebrief(firstTime, unlocked) {
    var m = SESSION.m;
    clear(root);
    var page = el('div', { class: 'page fade-in' });
    page.appendChild(hud());
    var card = el('div', { class: 'debrief-card' }, [
      el('div', { class: 'debrief-burst', text: '✓' }),
      el('div', { class: 'debrief-tag', text: 'CHAMADO RESOLVIDO · ' + m.code }),
      el('h1', { text: m.title }),
      firstTime ? el('div', { class: 'xp-gain', text: '+' + m.xp + ' XP' }) : el('div', { class: 'xp-gain dim', text: 'Revisão (XP já creditado)' }),
      m.badge ? el('div', { class: 'badge-earned' }, [el('span', { class: 'be-ic', text: '🏅' }), el('span', { text: 'Insígnia: ' + m.badge })]) : null,
      el('div', { class: 'debrief-box' }, [
        el('h3', { text: '🧠 Debrief — o que aconteceu' }),
        el('p', { text: m.debrief }),
      ]),
      el('div', { class: 'debrief-stats' }, [
        statBox('Comandos de config', String(SESSION.configCmds)),
        statBox('Comandos totais', String(SESSION.cmdCount)),
        statBox('Pistas usadas', SESSION.hintLevel + '/' + m.hints.length),
      ]),
      el('div', { class: 'debrief-actions' }, [
        el('button', { class: 'back', onclick: function () { showMap(); } }, ['◂ Mapa']),
        nextMissionBtn(m),
      ]),
    ]);
    page.appendChild(el('div', { class: 'narrow' }, [card]));
    root.appendChild(page);
    if (unlocked && unlocked.length) toastAchievements(unlocked);
    confetti();
  }
  function nextMissionBtn(m) {
    var idx = MISSIONS.findIndex(function (x) { return x.id === m.id; });
    var nxt = MISSIONS[idx + 1];
    if (nxt && isUnlocked(nxt.id)) {
      return el('button', { class: 'btn-primary', onclick: function () { startMission(nxt.id); } }, ['Próxima missão: ' + nxt.title + ' ▸']);
    }
    if (m.id === 'mF') {
      return el('button', { class: 'btn-primary', onclick: function () { showProfile(); } }, ['Ver perfil de carreira ▸']);
    }
    return el('button', { class: 'btn-primary', onclick: function () { showMap(); } }, ['Continuar ▸']);
  }
  function statBox(label, val) {
    return el('div', { class: 'sbox' }, [el('div', { class: 'sbox-v', text: val }), el('div', { class: 'sbox-l', text: label })]);
  }

  /* ====================================================================== *
   *  SANDBOX — Laboratório Livre
   * ====================================================================== */
  function showSandbox() {
    var spec = sandboxSpec();
    var world = E.buildWorld(spec);
    world._pinged = {};
    SESSION = { m: { title: 'Laboratório Livre', code: 'LAB', sandbox: true, topology: sandboxTopology() }, world: world, devId: 'R1', history: [], histIdx: -1, cmdCount: 0, configCmds: 0, hintLevel: 0, completed: true };
    clear(root);
    var page = el('div', { class: 'page mission-page' });
    page.appendChild(hud());
    var bar = el('div', { class: 'mission-bar' }, [
      el('button', { class: 'back', onclick: function () { showMap(); } }, ['◂ Sair']),
      el('div', { class: 'mb-title' }, [
        el('span', { class: 'mb-code', text: 'LAB' }),
        el('span', { class: 'mb-name', text: 'Laboratório Livre — experimente à vontade' }),
      ]),
      el('span', {}),
    ]);
    var grid = el('div', { class: 'panels panels-lab' });
    grid.appendChild(panelTopology());
    grid.appendChild(panelCenterLab());
    page.appendChild(bar);
    page.appendChild(grid);
    root.appendChild(page);
    renderTerminal();
    focusInput();
  }
  function panelCenterLab() {
    var p = el('div', { class: 'panel panel-center panel-center-lab' });
    var info = el('div', { class: 'lab-info' }, [
      panelHead('LABORATÓRIO', 'Topologia livre: 2 switches, 1 roteador, 3 PCs'),
      el('p', { class: 'dim', text: 'Sem objetivos, sem falhas plantadas. Pratique VLANs, trunks, roteamento, OSPF, ACLs, NAT — tudo o que aprendeu. Troque de dispositivo no seletor do console.' }),
    ]);
    var term = el('div', { class: 'terminal terminal-lab' });
    var termHead = el('div', { class: 'term-head' }, [
      el('span', { class: 'term-dots', html: '<i></i><i></i><i></i>' }),
      el('span', { class: 'term-title', text: 'Console IOS' }),
      el('div', { class: 'dev-switch', id: 'dev-switch' }),
    ]);
    term.appendChild(termHead);
    term.appendChild(el('div', { class: 'term-out', id: 'term-out' }));
    term.appendChild(el('div', { class: 'term-input-row' }, [
      el('span', { class: 'term-prompt', id: 'term-prompt', text: '>' }),
      el('input', { class: 'term-input', id: 'term-input', autocomplete: 'off', spellcheck: 'false' }),
    ]));
    p.appendChild(info);
    p.appendChild(term);
    return p;
  }
  function sandboxTopology() {
    return {
      nodes: [
        { id: 'R1', label: 'LAB-RTR', t: 'router', x: 50, y: 16 },
        { id: 'SW1', label: 'LAB-SW1', t: 'switch', x: 28, y: 46 },
        { id: 'SW2', label: 'LAB-SW2', t: 'switch', x: 72, y: 46 },
        { id: 'PC1', label: 'LAB-PC1', t: 'pc', x: 14, y: 82 },
        { id: 'PC2', label: 'LAB-PC2', t: 'pc', x: 38, y: 82 },
        { id: 'PC3', label: 'LAB-PC3', t: 'pc', x: 72, y: 82 },
      ],
      links: [
        { a: 'R1', b: 'SW1', l: 'Gi0/0' }, { a: 'R1', b: 'SW2', l: 'Gi0/1' },
        { a: 'SW1', b: 'SW2', l: 'Gi0/1' },
        { a: 'SW1', b: 'PC1', l: 'Fa0/1' }, { a: 'SW1', b: 'PC2', l: 'Fa0/2' },
        { a: 'SW2', b: 'PC3', l: 'Fa0/1' },
      ],
    };
  }
  function sandboxSpec() {
    return {
      devices: [
        { id: 'R1', name: 'LAB-RTR', type: 'router', ipRouting: true, interfaces: [
          { name: 'gi0/0', connected: true, adminUp: true, mode: 'routed' },
          { name: 'gi0/1', connected: true, adminUp: true, mode: 'routed' },
          { name: 'gi0/2', connected: false, adminUp: false, mode: 'routed' },
        ] },
        { id: 'SW1', name: 'LAB-SW1', type: 'switch', vlans: [{ id: 10, name: 'DADOS' }, { id: 20, name: 'VOZ' }], interfaces: [
          { name: 'gi0/1', connected: true, adminUp: true, mode: 'trunk', nativeVlan: 1 },
          { name: 'fa0/1', connected: true, adminUp: true, mode: 'access', accessVlan: 10 },
          { name: 'fa0/2', connected: true, adminUp: true, mode: 'access', accessVlan: 20 },
        ] },
        { id: 'SW2', name: 'LAB-SW2', type: 'switch', vlans: [{ id: 10, name: 'DADOS' }, { id: 20, name: 'VOZ' }], interfaces: [
          { name: 'gi0/1', connected: true, adminUp: true, mode: 'trunk', nativeVlan: 1 },
          { name: 'fa0/1', connected: true, adminUp: true, mode: 'access', accessVlan: 10 },
        ] },
        { id: 'PC1', name: 'LAB-PC1', type: 'pc', ip: '192.168.10.11', mask: '255.255.255.0', gateway: '192.168.10.1' },
        { id: 'PC2', name: 'LAB-PC2', type: 'pc', ip: '192.168.20.11', mask: '255.255.255.0', gateway: '192.168.20.1' },
        { id: 'PC3', name: 'LAB-PC3', type: 'pc', ip: '192.168.10.12', mask: '255.255.255.0', gateway: '192.168.10.1' },
      ],
      connectivity: function (w, src, target) { return { ok: true, ttl: 128 }; },
    };
  }

  /* ====================================================================== *
   *  PROFILE — stats + badges + achievements
   * ====================================================================== */
  function showProfile() {
    clear(root);
    var page = el('div', { class: 'page fade-in' });
    page.appendChild(hud());
    var li = levelInfo(state.xp);
    var stats = computeStats();
    var card = el('div', { class: 'profile' }, [
      el('div', { class: 'prof-head' }, [
        el('button', { class: 'back', onclick: function () { showMap(); } }, ['◂ Mapa']),
        el('h1', { text: 'Perfil de Carreira' }),
      ]),
      el('div', { class: 'prof-hero' }, [
        el('div', { class: 'prof-rank' }, [
          el('div', { class: 'prof-lvl', text: 'Nível ' + li.cur.lvl }),
          el('div', { class: 'prof-rankname', text: li.cur.name }),
          el('div', { class: 'prof-xp', text: state.xp + ' XP' }),
        ]),
        el('div', { class: 'prof-stats' }, Object.keys(stats).map(function (k) {
          return el('div', { class: 'stat-row' }, [
            el('span', { class: 'stat-name', text: k }),
            el('div', { class: 'stat-bar' }, [el('div', { class: 'stat-fill stat-' + slug(k), style: 'width:' + stats[k] + '%' })]),
            el('span', { class: 'stat-val', text: stats[k] + '%' }),
          ]);
        })),
      ]),
      el('h2', { class: 'sect', text: '🏆 Conquistas' }),
      el('div', { class: 'ach-grid' }, ACHIEVEMENTS.map(function (a) {
        var got = state.achievements[a.id];
        return el('div', { class: 'ach' + (got ? ' got' : '') }, [
          el('span', { class: 'ach-ic', text: a.icon }),
          el('div', {}, [el('div', { class: 'ach-name', text: a.name }), el('div', { class: 'ach-desc', text: a.desc })]),
          el('span', { class: 'ach-stat', text: got ? '✓' : '🔒' }),
        ]);
      })),
      el('h2', { class: 'sect', text: '🏅 Insígnias' }),
      Object.keys(state.badges).length
        ? el('div', { class: 'badge-grid' }, Object.keys(state.badges).map(function (b) { return el('span', { class: 'badge', text: '🏅 ' + b }); }))
        : el('p', { class: 'dim', text: 'Nenhuma insígnia ainda. Resolva missões para ganhá-las.' }),
      el('h2', { class: 'sect', text: '🗺️ Progresso das missões' }),
      el('div', { class: 'prog-grid' }, MISSIONS.map(function (m) {
        var done = state.completed[m.id];
        return el('div', { class: 'prog-cell' + (done ? ' done' : '') + (m.final ? ' final' : '') }, [
          el('span', { class: 'pc-code', text: m.code }),
          el('span', { class: 'pc-name', text: m.title }),
          el('span', { class: 'pc-stat', text: done ? '✅' : (isUnlocked(m.id) ? '▸' : '🔒') }),
        ]);
      })),
      el('div', { class: 'prof-foot' }, [
        el('button', { class: 'btn-ghost danger', onclick: resetProgress }, ['Reiniciar progresso']),
      ]),
    ]);
    page.appendChild(el('div', { class: 'narrow' }, [card]));
    root.appendChild(page);
  }
  function slug(k) { return { 'Switching': 'sw', 'Routing': 'rt', 'Segurança': 'sec', 'Troubleshooting': 'ts' }[k] || 'sw'; }
  function resetProgress() {
    if (!window.confirm('Reiniciar TODO o progresso (XP, missões, conquistas)? Não dá para desfazer.')) return;
    state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    save();
    showMap();
  }

  /* ====================================================================== *
   *  TOASTS + CONFETTI
   * ====================================================================== */
  function toastAchievements(list) {
    list.forEach(function (a, i) {
      setTimeout(function () {
        var t = el('div', { class: 'toast' }, [
          el('span', { class: 'toast-ic', text: a.icon }),
          el('div', {}, [el('div', { class: 'toast-t', text: 'Conquista desbloqueada!' }), el('div', { class: 'toast-n', text: a.name })]),
        ]);
        document.body.appendChild(t);
        setTimeout(function () { t.classList.add('show'); }, 30);
        setTimeout(function () { t.classList.remove('show'); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 400); }, 3800);
      }, i * 600);
    });
  }
  function confetti() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var c = el('div', { class: 'confetti' });
    var colors = ['var(--cyan)', 'var(--amber)', 'var(--green)', 'var(--magenta)'];
    for (var i = 0; i < 60; i++) {
      var p = el('i', { style: 'left:' + Math.random() * 100 + '%;animation-delay:' + Math.random() * 0.6 + 's;background:' + colors[i % 4] + ';transform:rotate(' + Math.random() * 360 + 'deg)' });
      c.appendChild(p);
    }
    document.body.appendChild(c);
    setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 4000);
  }

  /* ---- boot ------------------------------------------------------------- */
  function init() {
    if (state.xp > 0 || countCompleted() > 0) showMap(true);
    else runBoot();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
