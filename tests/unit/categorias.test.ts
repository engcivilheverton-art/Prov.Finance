import { describe, expect, it } from 'vitest';
import {
  CATEGORIAS_PADRAO, SEM_CATEGORIA, categoriaDoItem, chaveBase, idCategoriaPadrao, normalizar,
  idRegraCategoria, palavraCasa, removerCategoriaERegras, validarNomeCategoria, validarPalavrasCategoria,
  type CategoriaComId, type RegraCategoria,
} from '@/lib/categorias';

const categorias: CategoriaComId[] = CATEGORIAS_PADRAO.map((categoria) => ({ ...categoria, id: idCategoriaPadrao(categoria.nome) }));

describe('motor de categorias editáveis', () => {
  it('normaliza acentos, caixa e espaços e remove o sufixo de parcela da chave', () => {
    expect(normalizar('  Farmácia   São João ')).toBe('FARMACIA SAO JOAO');
    expect(chaveBase('CAFÉ CENTRAL 02/12')).toBe('CAFE CENTRAL');
    expect(chaveBase('CAFÉ CENTRAL')).toBe('CAFE CENTRAL');
  });

  it('gera uma regra determinística e segura como ID de documento mesmo com barra', async () => {
    const um = await idRegraCategoria('LOJA/ONLINE 1/12');
    const dois = await idRegraCategoria('LOJA/ONLINE 2/12');
    expect(um).toBe(dois);
    expect(um).toMatch(/^[0-9a-f]{64}$/);
  });

  it('casa somente em fronteira de palavra, escapa caracteres especiais e ignora palavra vazia', () => {
    expect(palavraCasa('LOJA IFD*ONLINE', 'IFD*')).toBe(true);
    expect(palavraCasa('SUPERMERCADO CENTRAL', 'SUPERMERC')).toBe(true);
    expect(palavraCasa('XUBER TRIP', 'UBER')).toBe(false);
    expect(palavraCasa('LOJA', '')).toBe(false);
  });

  it('prioriza regra do usuário, depois palavras-chave e por fim Sem categoria', () => {
    const mercado = categorias.find((c) => c.nome === 'Supermercado')!;
    const restaurante = categorias.find((c) => c.nome === 'Restaurantes')!;
    const regras: RegraCategoria[] = [{ id: 'a'.repeat(64), chave: 'SUPERMERCADO CENTRAL', categoriaId: restaurante.id }];
    expect(categoriaDoItem('SUPERMERCADO CENTRAL 1/3', categorias, regras)).toBe('Restaurantes');
    expect(categoriaDoItem('CARREFOUR EXPRESS', categorias, [])).toBe(mercado.nome);
    expect(categoriaDoItem('DESCONHECIDO 123', categorias, [])).toBe(SEM_CATEGORIA);
    expect(categoriaDoItem('SUPERMERCADO CENTRAL', categorias, [{ ...regras[0], categoriaId: 'apagada' }])).toBe(mercado.nome);
  });

  it('rejeita nome duplicado sem diferenciar acento e caixa, e reserva Sem categoria', () => {
    expect(validarNomeCategoria('SAUDE', categorias)).toContain('Já existe');
    expect(validarNomeCategoria('  sem   categoria ', categorias)).toContain('reservado');
    expect(validarNomeCategoria('Educação', categorias)).toBeNull();
  });

  it('valida a lista de palavras-chave e remove as regras junto da categoria', () => {
    expect(validarPalavrasCategoria(['SUPERMERC', ''])).toContain('Cada palavra');
    const id = categorias[0].id;
    const regras: RegraCategoria[] = [
      { id: '1', chave: 'A', categoriaId: id },
      { id: '2', chave: 'B', categoriaId: categorias[1].id },
    ];
    const resultado = removerCategoriaERegras(categorias, regras, id);
    expect(resultado.categorias.some((c) => c.id === id)).toBe(false);
    expect(resultado.regras.map((r) => r.id)).toEqual(['2']);
  });
});
