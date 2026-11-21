export type LuaTikzRenderEngine = 'lualatex' | 'tikzjax';
export type DarkModeStyle = 'auto-invert' | 'brightness-boost' | 'none';

export type SemicolonReminderMode = 'off' | 'hint' | 'auto-append';

export type DiagramAlignSetting =
	| 'left' | 'left-center' | 'center' | 'right-center' | 'right';

export interface LuaTikzSettings {
	renderEngine: LuaTikzRenderEngine;
	lualatexPath: string;
	enableLocalShellRenderer: boolean;
	showInstallNotice: boolean;
	outputFormat: 'svg' | 'png';
	timeoutMs: number;
	cacheEnabled: boolean;
	extraPreamble: string;
	/** Replaces the generated LuaLaTeX preamble entirely when non-empty. */
	customPreamble: string;
	/** Font-name overrides; blank means "use the built-in fallback chain". */
	mainFont: string;
	hebrewFont: string;
	arabicFont: string;
	inlineLivePreviewEnabledByDefault: boolean;
	darkModeStyle: DarkModeStyle;
	starterBlockOnNewFence: boolean;
	enableStructuralLint: boolean;
	semicolonReminderMode: SemicolonReminderMode;
	autoCloseBrackets: boolean;
	/**
	 * Code block languages LuaTikZ renders, comma separated. Configurable so
	 * a vault where another TikZ plugin already owns ```tikz can move this
	 * one onto its own fence instead of failing to load.
	 */
	codeBlockLanguages: string;
	/** Fallback alignment for blocks with no `% align=` directive. */
	defaultDiagramAlign: DiagramAlignSetting;
	/**
	 * Fallback rendered width for blocks with no `% width=` directive.
	 * Empty means "natural size"; `100%`, `420px`, `12cm`, … scale the
	 * diagram to the note's width.
	 */
	defaultDiagramWidth: string;
}

export const DEFAULT_SETTINGS: LuaTikzSettings = {
	renderEngine: 'lualatex',
	lualatexPath: '/Library/TeX/texbin/lualatex',
	enableLocalShellRenderer: true,
	showInstallNotice: true,
	outputFormat: 'svg',
	timeoutMs: 15000,
	cacheEnabled: true,
	extraPreamble: '',
	customPreamble: '',
	mainFont: '',
	hebrewFont: '',
	arabicFont: '',
	inlineLivePreviewEnabledByDefault: true,
	darkModeStyle: 'auto-invert',
	starterBlockOnNewFence: true,
	enableStructuralLint: true,
	semicolonReminderMode: 'hint',
	autoCloseBrackets: true,
	codeBlockLanguages: 'tikz, luatikz',
	defaultDiagramAlign: 'center',
	defaultDiagramWidth: '',
};

/**
 * Every string-valued setting. parseSettings and persistSetting both drive off
 * this list — a new string setting missing from it is silently dropped on save,
 * because `key in DEFAULT_SETTINGS` passes but no branch assigns.
 */
export const STRING_SETTING_KEYS = [
	'lualatexPath',
	'extraPreamble',
	'customPreamble',
	'mainFont',
	'hebrewFont',
	'arabicFont',
	'codeBlockLanguages',
	'defaultDiagramWidth',
] as const;

/**
 * Settings that change render output. Both cache keys and cache invalidation
 * drive off this, so a change can never serve a stale diagram.
 */
export const RENDER_IDENTITY_KEYS = [
	'lualatexPath',
	'extraPreamble',
	'customPreamble',
	'mainFont',
	'hebrewFont',
	'arabicFont',
	'timeoutMs',
	'outputFormat',
	'darkModeStyle',
] as const;
