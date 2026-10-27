/**
 * Gestor de Estado, Filtros y Paginación para Pokédex Pública
 */

import type { ClassificationFilter } from '../shared/catalog-filters.js';
import { defaultSortDirection, type MinStat, type SortDirection, type SortKey } from '../shared/catalog-sort.js';
import type { FilterState } from '../shared/filter-url.js';
import type { Pokemon } from '../types.js';

export const ITEMS_PER_PAGE = 48;
export const SEARCH_DEBOUNCE_MS = 150;

export const CLASSIFICATION_CHIP_LABELS: Record<ClassificationFilter, string> = {
  legendario: 'Legendarios',
  mitico: 'Míticos',
  especial: 'Legendarios y míticos',
};

let allPokemons: Pokemon[] = [];
let filteredPokemons: Pokemon[] = [];
let currentPage = 1;
let selectedTypes: string[] = [];
let currentGeneration = 'all';
let onlyWithMega = false;
let searchQuery = '';
let minStat: MinStat | null = null;
let classification: ClassificationFilter | null = null;
let ability: string | null = null;
let abilityIndex = new Map<string, string>();
let currentSort: SortKey = 'id';
let currentSortDir: SortDirection = 'asc';

export function getAllPokemons(): Pokemon[] {
  return allPokemons;
}

export function setAllPokemons(pokemons: Pokemon[]): void {
  allPokemons = pokemons;
}

export function getFilteredPokemons(): Pokemon[] {
  return filteredPokemons;
}

export function setFilteredPokemons(pokemons: Pokemon[]): void {
  filteredPokemons = pokemons;
}

export function getCurrentPage(): number {
  return currentPage;
}

export function setCurrentPage(page: number): void {
  currentPage = page;
}

export function getSelectedTypes(): string[] {
  return selectedTypes;
}

export function setSelectedTypes(types: string[]): void {
  selectedTypes = types;
}

export function getCurrentGeneration(): string {
  return currentGeneration;
}

export function setCurrentGeneration(gen: string): void {
  currentGeneration = gen;
}

export function getOnlyWithMega(): boolean {
  return onlyWithMega;
}

export function setOnlyWithMega(mega: boolean): void {
  onlyWithMega = mega;
}

export function getSearchQuery(): string {
  return searchQuery;
}

export function setSearchQuery(query: string): void {
  searchQuery = query;
}

export function getMinStat(): MinStat | null {
  return minStat;
}

export function setMinStat(stat: MinStat | null): void {
  minStat = stat;
}

export function getClassification(): ClassificationFilter | null {
  return classification;
}

export function setClassification(c: ClassificationFilter | null): void {
  classification = c;
}

export function getAbility(): string | null {
  return ability;
}

export function setAbility(a: string | null): void {
  ability = a;
}

export function getAbilityIndex(): Map<string, string> {
  return abilityIndex;
}

export function setAbilityIndex(index: Map<string, string>): void {
  abilityIndex = index;
}

export function getCurrentSort(): SortKey {
  return currentSort;
}

export function setCurrentSort(sort: SortKey): void {
  currentSort = sort;
}

export function getCurrentSortDir(): SortDirection {
  return currentSortDir;
}

export function setCurrentSortDir(dir: SortDirection): void {
  currentSortDir = dir;
}

export function currentFilterState(): FilterState {
  return {
    searchQuery,
    types: selectedTypes,
    generation: currentGeneration,
    onlyWithMega,
    minStat,
    clasificacion: classification,
    habilidad: ability,
    sort: currentSort,
    dir: currentSortDir,
    page: currentPage,
  };
}

export function countAdvancedFilters(): number {
  return (
    (currentGeneration !== 'all' ? 1 : 0) +
    (onlyWithMega ? 1 : 0) +
    (selectedTypes.length > 0 ? 1 : 0) +
    (classification ? 1 : 0) +
    (minStat ? 1 : 0) +
    (ability ? 1 : 0)
  );
}

export function hasActiveFiltersState(): boolean {
  return (
    Boolean(searchQuery.trim()) ||
    selectedTypes.length > 0 ||
    currentGeneration !== 'all' ||
    onlyWithMega ||
    minStat !== null ||
    classification !== null ||
    ability !== null
  );
}

export function hasCustomSortState(): boolean {
  return currentSort !== 'id' || currentSortDir !== defaultSortDirection('id');
}

export function resetFilterState(): void {
  searchQuery = '';
  selectedTypes = [];
  currentGeneration = 'all';
  onlyWithMega = false;
  minStat = null;
  classification = null;
  ability = null;
}
