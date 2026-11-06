/*!
 * ct-core.js — Núcleo de cálculo da Calculadora do Trabalhador
 * ----------------------------------------------------------------
 * - PURO: sem DOM, sem localStorage, sem rede. Entra objeto, sai objeto.
 * - UMD: funciona via <script> (window.CTCalc), require() (Node) e import (bundlers).
 * - As tabelas legais são injetadas por createCalculators(tabelas); no PROV
 *   vêm diretamente de tax-tables.json, sem duplicar o arquivo gerado.
 *
 * API principal:
 *   CTCalc.calculate(slug, valores)   -> view-model pronto para renderizar (ver ct-core.d.ts)
 *   CTCalc.inss(bruto)                -> number
 *   CTCalc.irrf({ bruto, dependentes?, pensao?, inss? }) -> objeto detalhado
 *   CTCalc.horasExtras / bancoDeHoras / ferias / decimoTerceiro / rescisao / converterHoras
 *   CTCalc.createCalculators(tabelas) -> nova instância com outras tabelas (ex.: simular outro ano)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(null);
  } else {
    root.CTCalc = factory(root.CTTables);
  }
})(typeof self !== 'undefined' ? self : this, function (DEFAULT_TABLES) {
  'use strict';

  /* ---------- utilitários ---------- */
  var EPS = 1e-9;
  function r2(v) { return Math.round((v + (v >= 0 ? EPS : -EPS)) * 100) / 100; }
  function fail(msg) { return { ok: false, error: msg }; }

  /** Aceita number, "1234.56" ou "1.234,56". Retorna null se vazio/inválido. */
  function toNum(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var t = String(v).trim().replace(/\s/g, '');
    if (t.indexOf(',') !== -1) t = t.replace(/\./g, '').replace(',', '.');
    var n = Number(t);
    return isFinite(n) ? n : null;
  }

  var moneyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  function formatMoney(v) { return moneyFmt.format(v === 0 ? 0 : v); } // evita "-R$ 0,00"

  /** "hh:mm" | "hh" | número de horas -> minutos (inteiro) ou null */
  function parseHHMM(s) {
    if (typeof s === 'number') return isFinite(s) ? Math.round(s * 60) : null;
    var m = /^\s*(-)?(\d+)(?::(\d{1,2}))?\s*$/.exec(String(s));
    if (!m) return null;
    var min = m[3] === undefined ? 0 : Number(m[3]);
    if (min > 59) return null;
    var t = Number(m[2]) * 60 + min;
    return m[1] ? -t : t;
  }
  function toHHMM(min) {
    var sign = min < 0 ? '-' : '';
    var a = Math.abs(min);
    return sign + String(Math.floor(a / 60)).padStart(2, '0') + ':' + String(a % 60).padStart(2, '0');
  }

  function createCalculators(T) {
    if (!T) throw new Error('CTCalc: tabelas ausentes (inicialize com createCalculators(tabelas)).');

    /* ================= INSS ================= */
    function inssDetalhe(bruto) {
      var salario = Math.max(0, toNum(bruto) || 0);
      var base = Math.min(salario, T.inss.teto);
      var prev = 0, total = 0, faixas = [];
      for (var i = 0; i < T.inss.faixas.length; i++) {
        var f = T.inss.faixas[i];
        var parcela = Math.max(0, Math.min(base, f.ate) - prev);
        var valor = parcela * f.aliquota;
        faixas.push({ ate: f.ate, aliquota: f.aliquota, base: r2(parcela), valor: r2(valor) });
        total += valor;
        prev = f.ate;
      }
      var valorTotal = r2(total);
      return {
        bruto: salario,
        valor: valorTotal,
        baseLimitadaAoTeto: r2(base),
        aliquotaEfetiva: salario > 0 ? valorTotal / salario : 0,
        faixas: faixas
      };
    }
    function inss(bruto) { return inssDetalhe(bruto).valor; }

    /* ================= IRRF ================= */
    function impostoTabela(base) {
      if (base <= 0) return 0;
      for (var i = 0; i < T.irrf.faixas.length; i++) {
        var f = T.irrf.faixas[i];
        if (f.ate === null || base <= f.ate) return Math.max(0, base * f.aliquota - f.deduzir);
      }
      return 0;
    }
    function reducaoLei15270(bruto, imposto) {
      var r = T.irrf.reducao;
      if (!r) return 0;
      if (bruto <= r.isencaoAte) return Math.min(imposto, r.maximo);
      if (bruto <= r.parcialAte) return Math.min(imposto, Math.max(0, r.formula.a - r.formula.b * bruto));
      return 0;
    }
    /**
     * IRRF mensal. O servidor escolhe o método MAIS VANTAJOSO:
     *  (a) deduções legais: INSS + dependentes + pensão   ou   (b) desconto simplificado fixo.
     * Depois aplica a redução da Lei 15.270/2025 (calculada sobre o rendimento bruto tributável).
     */
    function irrf(i) {
      var bruto = Math.max(0, toNum(i.bruto) || 0);
      var dep = Math.max(0, Math.floor(toNum(i.dependentes) || 0));
      var pensao = Math.max(0, toNum(i.pensao) || 0);
      var inssVal = (i.inss === undefined || i.inss === null) ? inss(bruto) : (toNum(i.inss) || 0);

      var deducaoDeps = dep * T.irrf.deducaoDependente;
      var baseLegal = bruto - inssVal - deducaoDeps - pensao;
      var baseSimpl = bruto - T.irrf.descontoSimplificado;
      var impLegal = r2(impostoTabela(baseLegal));
      var impSimpl = r2(impostoTabela(baseSimpl));
      var metodo = impSimpl < impLegal ? 'simplificado' : 'deducoes';
      var impostoTab = metodo === 'simplificado' ? impSimpl : impLegal;
      var base = metodo === 'simplificado' ? baseSimpl : baseLegal;
      var reducao = r2(reducaoLei15270(bruto, impostoTab));
      var imposto = r2(Math.max(0, impostoTab - reducao));
      return {
        bruto: bruto, inss: inssVal, dependentes: dep, deducaoDependentes: r2(deducaoDeps), pensao: pensao,
        metodo: metodo, baseCalculo: r2(Math.max(0, base)),
        impostoTabela: impostoTab, reducao: reducao, imposto: imposto,
        aliquotaEfetiva: bruto > 0 ? imposto / bruto : 0,
        liquido: r2(bruto - inssVal - imposto)
      };
    }

    /* ================= Horas extras ================= */
    function divisorMensal(jornadaDiaria) {
      // 6 dias/semana limitado a 44h semanais x 5  (8h->220, 7h->210, 6h->180, 4h->120)
      return Math.min(T.jornada.limiteSemanalHoras, jornadaDiaria * 6) * 5;
    }
    function horasExtras(i) {
      var salario = toNum(i.salario), qtd = toNum(i.qtd);
      var jornada = toNum(i.jornada); if (jornada === null) jornada = 8;
      if (!(salario > 0)) return fail('Informe o salário mensal.');
      if (!(jornada > 0 && jornada <= 24)) return fail('Informe uma jornada diária entre 1 e 24 horas.');
      if (!(qtd > 0)) return fail('Informe a quantidade de horas extras.');
      var key = String(i.pct === undefined ? '50' : i.pct), pct;
      if (key === 'custom') {
        var c = toNum(i.pctCustom);
        if (c === null || c < 0) return fail('Informe o percentual personalizado.');
        pct = c / 100;
      } else { pct = key === '100' ? 1 : 0.5; }
      var divisor = toNum(i.divisor) || divisorMensal(jornada);
      var vh = salario / divisor, vhe = vh * (1 + pct);
      return {
        ok: true, salario: salario, jornada: jornada, divisor: divisor, pct: pct, qtd: qtd,
        valorHora: r2(vh), adicionalHora: r2(vh * pct), valorHoraExtra: r2(vhe), total: r2(vhe * qtd)
      };
    }

    /* ================= Banco de horas ================= */
    function bancoDeHoras(i) {
      var tr = parseHHMM(i.trabalhadas), dv = parseHHMM(i.devidas);
      if (tr === null || dv === null) return fail('Informe as horas no formato hh:mm (ex.: 48:30).');
      return { ok: true, trabalhadasMin: tr, devidasMin: dv, saldoMin: tr - dv };
    }

    /* ================= Férias ================= */
    function ferias(i) {
      var salario = toNum(i.salario), dias = toNum(i.dias); if (dias === null) dias = 30;
      if (!(salario > 0)) return fail('Informe o salário bruto.');
      if (!(dias >= 1 && dias <= 30)) return fail('Os dias de férias devem estar entre 1 e 30.');
      var abono = i.abono === true || i.abono === 'true' || i.abono === 'on';
      var diasAbono = abono ? Math.floor(dias / 3) : 0;   // até 1/3 pode ser vendido (art. 143 CLT)
      var diasGozados = dias - diasAbono;
      var vd = salario / 30;
      var fer = vd * diasGozados, terco = fer / 3, ab = vd * diasAbono, abTerco = ab / 3;
      return {
        ok: true, salario: salario, dias: dias, abono: abono, diasGozados: diasGozados, diasAbono: diasAbono,
        ferias: r2(fer), tercoFerias: r2(terco), abonoPecuniario: r2(ab), tercoAbono: r2(abTerco),
        total: r2(fer + terco + ab + abTerco)
      };
    }

    /* ================= 13º salário ================= */
    function decimoTerceiro(i) {
      var salario = toNum(i.salario), meses = toNum(i.meses);
      if (!(salario > 0)) return fail('Informe o salário.');
      if (!(meses >= 1 && meses <= 12)) return fail('Meses trabalhados deve estar entre 1 e 12.');
      var bruto = salario / 12 * meses;
      var inssVal = inss(bruto);
      var ir = irrf({ bruto: bruto, inss: inssVal });
      var liquido = r2(bruto - inssVal - ir.imposto);
      return {
        ok: true, salario: salario, meses: Math.floor(meses), bruto: r2(bruto), inss: inssVal, irrf: ir.imposto,
        liquido: liquido, primeiraParcela: r2(bruto / 2), segundaParcela: r2(liquido - r2(bruto / 2))
      };
    }

    /* ================= Rescisão (ESTIMATIVA) ================= */
    var TIPOS_RESCISAO = {
      'sem-justa-causa': 'Sem justa causa',
      'pedido': 'Pedido de demissão',
      'justa-causa': 'Justa causa',
      'acordo': 'Acordo (art. 484-A CLT)'
    };
    function rescisao(i) {
      var salario = toNum(i.salario), anos = toNum(i.anos);
      var tipo = i.tipo || 'sem-justa-causa';
      if (!(salario > 0)) return fail('Informe o salário bruto.');
      if (anos === null || anos < 0) return fail('Informe o tempo de empresa em anos (pode usar 0,5 para 6 meses).');
      if (!TIPOS_RESCISAO[tipo]) return fail('Tipo de desligamento inválido.');
      var hoje = i.hoje ? new Date(i.hoje) : new Date();
      var diasMes = toNum(i.dias); if (diasMes === null) diasMes = 30;
      diasMes = Math.min(31, Math.max(0, diasMes));

      var mesesTotais = Math.round(anos * 12);
      var mesesNoAno = toNum(i.mesesNoAno) || (hoje.getMonth() + 1);
      var meses13 = Math.min(mesesNoAno, mesesTotais);
      var mesesFerias = mesesTotais >= 12 ? mesesTotais % 12 : mesesTotais;

      var saldoSalario = salario / 30 * diasMes;
      var proporcionais = tipo !== 'justa-causa';     // justa causa: sem férias/13º proporcionais
      var feriasProp = proporcionais ? salario / 12 * mesesFerias : 0;
      var terco = feriasProp / 3;
      var decimo = proporcionais ? salario / 12 * meses13 : 0;

      var avisoDias = Math.min(30 + 3 * Math.floor(anos), 90);
      var fgtsEstimado = salario * T.fgts.aliquotaMensal * mesesTotais;
      var aviso = 0, multa = 0;
      if (tipo === 'sem-justa-causa') { aviso = salario / 30 * avisoDias; multa = fgtsEstimado * T.fgts.multaSemJustaCausa; }
      if (tipo === 'acordo') { aviso = salario / 30 * avisoDias * 0.5; multa = fgtsEstimado * T.fgts.multaAcordo; }

      var total = saldoSalario + feriasProp + terco + decimo + aviso + multa;
      return {
        ok: true, tipo: tipo, tipoLabel: TIPOS_RESCISAO[tipo], salario: salario, anos: anos,
        mesesTotais: mesesTotais, mesesFerias: mesesFerias, meses13: meses13, avisoDias: avisoDias,
        saldoSalario: r2(saldoSalario), feriasProporcionais: r2(feriasProp), tercoFerias: r2(terco),
        decimoProporcional: r2(decimo), avisoPrevio: r2(aviso), fgtsEstimado: r2(fgtsEstimado),
        multaFgts: r2(multa), total: r2(total)
      };
    }

    /* ================= Conversor de horas ================= */
    function converterHoras(i) {
      var tipo = i.tipo || 'h2m', raw = String(i.valor === undefined ? '' : i.valor).trim();
      if (!raw) return fail('Informe o valor para converter.');
      var n, min;
      if (tipo === 'h2m' || tipo === 'dec2hm') {
        n = toNum(raw); if (n === null) return fail('Valor inválido.');
        min = Math.round(n * 60);
        return { ok: true, tipo: tipo, horasDecimais: n, minutos: min, hhmm: toHHMM(min) };
      }
      if (tipo === 'm2h') {
        n = toNum(raw); if (n === null) return fail('Valor inválido.');
        min = Math.round(n);
        return { ok: true, tipo: tipo, horasDecimais: min / 60, minutos: min, hhmm: toHHMM(min) };
      }
      if (tipo === 'hm2dec') {
        if (raw.indexOf(':') === -1) return fail('Use o formato hh:mm (ex.: 2:45).');
        min = parseHHMM(raw); if (min === null) return fail('Horário inválido. Use hh:mm (ex.: 2:45).');
        return { ok: true, tipo: tipo, horasDecimais: min / 60, minutos: min, hhmm: toHHMM(min) };
      }
      return fail('Tipo de conversão inválido.');
    }

    /* ================= View-models (o que a UI renderiza) ================= */
    function row(label, value, kind, tone) { return { label: label, value: value, kind: kind || 'money', tone: tone || null }; }
    function view(title, rows, total, data, notes) {
      return { ok: true, title: title, rows: rows, total: total || null, notes: notes || [], data: data };
    }
    function pctText(p) { return (p * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%'; }

    var VIEWS = {
      'horas-extras': function (v) {
        var r = horasExtras(v); if (!r.ok) return r;
        return view('Resultado – Horas Extras', [
          row('Divisor mensal usado', r.divisor + ' h', 'text'),
          row('Valor da hora normal', r.valorHora),
          row('Adicional (' + pctText(r.pct) + ')', r.adicionalHora),
          row('Valor da hora extra', r.valorHoraExtra, 'money', 'blue'),
          row('Quantidade', r.qtd + ' h', 'text')
        ], row('Total a receber', r.total), r);
      },
      'banco-de-horas': function (v) {
        var r = bancoDeHoras(v); if (!r.ok) return r;
        var pos = r.saldoMin >= 0;
        return view('Resultado – Banco de Horas', [
          row('Horas trabalhadas', toHHMM(r.trabalhadasMin), 'text'),
          row('Horas devidas', toHHMM(r.devidasMin), 'text'),
          row('Saldo', toHHMM(r.saldoMin) + (pos ? ' (positivo)' : ' (negativo)'), 'text', pos ? 'green' : 'red')
        ], null, r);
      },
      'ferias': function (v) {
        var r = ferias(v); if (!r.ok) return r;
        var rows = [row('Férias (' + r.diasGozados + ' dias)', r.ferias), row('1/3 constitucional', r.tercoFerias, 'money', 'blue')];
        if (r.abono) {
          rows.push(row('Abono pecuniário (' + r.diasAbono + ' dias)', r.abonoPecuniario));
          rows.push(row('1/3 sobre o abono', r.tercoAbono));
        }
        return view('Resultado – Férias', rows, row('Total bruto a receber', r.total), r,
          ['Valor bruto: o desconto de INSS/IRRF sobre as férias não está incluído.']);
      },
      'decimo-terceiro': function (v) {
        var r = decimoTerceiro(v); if (!r.ok) return r;
        return view('Resultado – 13º Salário', [
          row('13º bruto (' + r.meses + '/12)', r.bruto),
          row('Desconto INSS (estimado)', -r.inss, 'money', 'red'),
          row('Desconto IRRF (estimado)', -r.irrf, 'money', 'red'),
          row('1ª parcela (sem descontos)', r.primeiraParcela),
          row('2ª parcela (com descontos)', r.segundaParcela)
        ], row('Valor líquido estimado', r.liquido), r);
      },
      'rescisao': function (v) {
        var r = rescisao(v); if (!r.ok) return r;
        var rows = [row('Tipo de desligamento', r.tipoLabel, 'text'), row('Saldo de salário', r.saldoSalario)];
        if (r.tipo !== 'justa-causa') {
          rows.push(row('Férias proporcionais (' + r.mesesFerias + '/12)', r.feriasProporcionais));
          rows.push(row('1/3 sobre férias', r.tercoFerias));
          rows.push(row('13º proporcional (' + r.meses13 + '/12)', r.decimoProporcional));
        }
        if (r.avisoPrevio) rows.push(row('Aviso prévio indenizado (' + (r.tipo === 'acordo' ? '50% de ' : '') + r.avisoDias + ' dias)', r.avisoPrevio));
        if (r.multaFgts) rows.push(row('Multa do FGTS (' + (r.tipo === 'acordo' ? '20%' : '40%') + ' s/ saldo estimado)', r.multaFgts, 'money', 'blue'));
        var notes = ['Estimativa bruta, sem descontos de INSS/IRRF.'];
        if (r.multaFgts) notes.push('O saldo do FGTS é estimado em 8% do salário por mês de contrato; consulte seu extrato real.');
        if (r.tipo === 'justa-causa') notes.push('Férias vencidas (se houver) não estão incluídas.');
        return view('Estimativa de Rescisão', rows, row('Total estimado (bruto)', r.total), r, notes);
      },
      'inss': function (v) {
        var s = toNum(v.salario);
        if (!(s > 0)) return fail('Informe o salário bruto.');
        var d = inssDetalhe(s);
        var rows = [row('Salário bruto', s)];
        d.faixas.forEach(function (f) { if (f.base > 0) rows.push(row(pctText(f.aliquota) + ' sobre ' + formatMoney(f.base), f.valor)); });
        rows.push(row('Desconto INSS', -d.valor, 'money', 'red'));
        rows.push(row('Alíquota efetiva', pctText(d.aliquotaEfetiva), 'text'));
        return view('Resultado – INSS', rows, row('Salário após INSS', r2(s - d.valor)),
          d, s > T.inss.teto ? ['Salário acima do teto: a contribuição é limitada ao valor máximo.'] : []);
      },
      'irrf': function (v) {
        var s = toNum(v.salario);
        if (!(s > 0)) return fail('Informe o salário bruto.');
        var r = irrf({ bruto: s, dependentes: v.dependentes });
        var rows = [
          row('Salário bruto', s),
          row('Desconto INSS', -r.inss, 'money', 'red'),
          row('Dependentes (' + r.dependentes + ')', -r.deducaoDependentes, 'money', 'red'),
          row('Método mais vantajoso', r.metodo === 'simplificado' ? 'Desconto simplificado' : 'Deduções legais', 'text'),
          row('Base de cálculo', r.baseCalculo),
          row('Imposto pela tabela', r.impostoTabela)
        ];
        if (r.reducao > 0) rows.push(row('Redução (Lei 15.270/2025)', -r.reducao, 'money', 'green'));
        rows.push(row('IRRF a reter', -r.imposto, 'money', 'red'));
        rows.push(row('Alíquota efetiva', pctText(r.aliquotaEfetiva), 'text'));
        return view('Resultado – IRRF', rows, row('Salário líquido estimado', r.liquido), r);
      },
      'conversor-de-horas': function (v) {
        var r = converterHoras(v); if (!r.ok) return r;
        var hd = (Math.round(r.horasDecimais * 10000) / 10000).toLocaleString('pt-BR');
        var rows = {
          h2m: [row('Horas (decimal)', hd + ' h', 'text'), row('Total em minutos', r.minutos + ' min', 'text', 'blue'), row('Formato hh:mm', r.hhmm, 'text')],
          m2h: [row('Total em minutos', r.minutos + ' min', 'text'), row('Horas (decimal)', hd + ' h', 'text', 'blue'), row('Formato hh:mm', r.hhmm, 'text')],
          dec2hm: [row('Horas decimais', hd + ' h', 'text'), row('Formato hh:mm', r.hhmm, 'text', 'blue'), row('Total em minutos', r.minutos + ' min', 'text')],
          hm2dec: [row('Formato hh:mm', r.hhmm, 'text'), row('Horas (decimal)', hd + ' h', 'text', 'blue'), row('Total em minutos', r.minutos + ' min', 'text')]
        }[r.tipo];
        return view('Resultado – Conversor', rows, null, r);
      }
    };

    function calculate(slug, values) {
      var fn = VIEWS[slug];
      if (!fn) return fail('Ferramenta desconhecida: ' + slug);
      try { return fn(values || {}); } catch (e) { return fail('Não foi possível calcular com esses valores.'); }
    }

    /* ---------- formatação de linhas (reutilizada por UI, cópia e PDF) ---------- */
    function formatRow(r) { return r.kind === 'money' ? formatMoney(r.value) : String(r.value); }
    function toText(res) {
      var out = [res.title];
      res.rows.forEach(function (r) { out.push(r.label + ': ' + formatRow(r)); });
      if (res.total) out.push(res.total.label + ': ' + formatRow(res.total));
      (res.notes || []).forEach(function (n) { out.push('* ' + n); });
      return out.join('\n');
    }

    return {
      tables: T,
      tools: Object.keys(VIEWS),
      calculate: calculate,
      inss: inss, inssDetalhe: inssDetalhe, irrf: irrf,
      horasExtras: horasExtras, bancoDeHoras: bancoDeHoras, ferias: ferias,
      decimoTerceiro: decimoTerceiro, rescisao: rescisao, converterHoras: converterHoras,
      formatMoney: formatMoney, formatRow: formatRow, toText: toText,
      parseHHMM: parseHHMM, toHHMM: toHHMM, toNum: toNum
    };
  }

  var api = DEFAULT_TABLES ? createCalculators(DEFAULT_TABLES) : {};
  api.createCalculators = createCalculators;
  return api;
});
