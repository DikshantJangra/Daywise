import { App, MarkdownView, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

type Provider = 'gemini' | 'local';

interface DailySummarySettings {
	apiKey: string;
	model: string;
	addHeader: boolean;
	provider: Provider;
}

const DEFAULT_SETTINGS: DailySummarySettings = {
	apiKey: '',
	model: 'gemini-1.5-flash',
	addHeader: true,
	provider: 'local'
}

export default class DailySummaryPlugin extends Plugin {
	settings: DailySummarySettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new DailySummarySettingTab(this.app, this));

		this.addCommand({
			id: 'generate-daily-summary',
			name: 'Generate Daily Summary from Note',
			callback: () => this.generateSummary(),
		});
	}

	async generateSummary() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			new Notice('No active Markdown note');
			return;
		}

		const file = view.file;
		if (!file) {
			new Notice('No active file');
			return;
		}

		const originalContent = await this.app.vault.read(file);
		if (!originalContent || originalContent.trim().length === 0) {
			new Notice('Note is empty');
			return;
		}

		let summary = '';
		try {
			if (this.settings.provider === 'local' || !this.settings.apiKey?.trim()) {
				summary = this.localFormatToTable(originalContent);
			} else {
				const prompt = this.buildPrompt(originalContent);
				summary = await this.queryGeminiWithRetry(prompt);
			}
		} catch (error: any) {
			console.error(error);
			new Notice(`Summary failed: ${error?.message ?? 'unknown error'}`);
			return;
		}

		const header = this.settings.addHeader ? '\n\n---\n### 🧾 Daily Summary\n' : '\n\n';
		const updated = `${originalContent}${header}${summary}`;
		await this.app.vault.modify(file, updated);
		new Notice('Daily summary inserted');
	}

	// Simple local formatter as a fallback (no API required)
	localFormatToTable(content: string): string {
		const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
		const rows: { time: string; activity: string; notes: string }[] = [];
		const timeRegex = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)?\b/;

		function normalizeTime(match: RegExpMatchArray | null): string | null {
			if (!match) return null;
			let hour = parseInt(match[1] ?? '0', 10);
			let minute = parseInt(match[2] ?? '0', 10);
			let meridiem = (match[3] || '').toUpperCase();
			if (!meridiem) {
				// Heuristic: assume AM before 12, PM for hours 12-23 if given
				meridiem = hour >= 7 && hour <= 11 ? 'AM' : 'PM';
			}
			if (hour === 0) hour = 12;
			if (hour > 12) { hour -= 12; meridiem = 'PM'; }
			const mm = minute.toString().padStart(2, '0');
			return `${hour}:${mm} ${meridiem}`;
		}

		for (const line of lines) {
			const lower = line.toLowerCase();
			let time = '';
			let activity = line;
			let notes = '';

			// Detect explicit duration in brackets like [2hrs]
			const durationMatch = line.match(/\[(.*?)\]/);
			if (durationMatch) {
				notes = durationMatch[1];
				activity = activity.replace(durationMatch[0], '').trim();
			}

			// Detect ranges like "till" or "to"
			if (lower.includes('till') || lower.includes('to')) {
				const parts = line.split(/\b(?:till|to)\b/i);
				if (parts.length === 2) {
					const startMatch = parts[0].match(timeRegex);
					const endMatch = parts[1].match(timeRegex);
					const start = normalizeTime(startMatch);
					const end = normalizeTime(endMatch);
					if (start && end) {
						time = `${start}–${end}`;
						activity = parts[0].replace(timeRegex, '').trim();
					}
				}
			}

			// If not a range, try single time
			if (!time) {
				const m = line.match(timeRegex);
				const t = normalizeTime(m);
				if (t) {
					time = t;
					activity = line.replace(m![0], '').replace(/\b(at|around|by)\b/i, '').trim();
				}
			}

			// Clean activity wording
			activity = activity
				.replace(/^-+\s*/, '')
				.replace(/\s{2,}/g, ' ')
				.replace(/[!]+/g, '')
				.replace(/\s*-\s*$/,'')
				.trim();

			if (!activity) activity = '—';
			rows.push({ time: time || '—', activity, notes });
		}

		const header = '| Time | Activity | Notes |';
		const sep = '|---|---|---|';
		const body = rows.map(r => `| ${r.time} | ${r.activity} | ${r.notes || '-'} |`).join('\n');
		return `${header}\n${sep}\n${body}`;
	}

	buildPrompt(content: string): string {
		return [
			'You are a helpful assistant that restructures daily activity logs.',
			'Convert the following freeform day log into a concise Markdown table.',
			'Columns: Time, Activity, Notes.',
			'Follow rules:',
			'- Normalize times (e.g., 7:30 -> 7:30 AM).',
			'- For ranges, infer start–end when possible.',
			'- Keep notes short and remove exclamations/emojis unless meaningful.',
			'- Output ONLY a Markdown table, no extra text before/after.',
			'',
			content
		].join('\n');
	}

	async queryGeminiWithRetry(prompt: string): Promise<string> {
		let delay = 500;
		for (let attempt = 1; attempt <= 3; attempt++) {
			try {
				return await this.queryGemini(prompt);
			} catch (e: any) {
				const message = String(e?.message || '');
				if (/HTTP\s+429|HTTP\s+503/i.test(message) && attempt < 3) {
					await new Promise(r => setTimeout(r, delay));
					delay *= 2;
					continue;
				}
				throw e;
			}
		}
		throw new Error('Retry failed');
	}

	async queryGemini(prompt: string): Promise<string> {
		const apiKey = this.settings.apiKey?.trim();
		if (!apiKey) {
			throw new Error('Missing Gemini API key. Set it in Settings → Daily Summary (Gemini).');
		}

		const endpoint = `https://generativelanguage.googleapis.com/v1/models/${this.settings.model}:generateContent?key=${encodeURIComponent(apiKey)}`;

		// Abort if network is stuck
		const controller = new AbortController();
		const timeoutId = window.setTimeout(() => controller.abort(), 30000);

		const res = await fetch(endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [ { parts: [{ text: prompt }] } ],
				generationConfig: { temperature: 0.2, topP: 0.95, topK: 40, maxOutputTokens: 1024 },
				safetySettings: [
					{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
					{ category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
					{ category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
					{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
				]
			}),
			signal: controller.signal
		}).finally(() => window.clearTimeout(timeoutId));

		if (!res.ok) {
			const text = await res.text();
			throw new Error(`HTTP ${res.status}: ${text}`);
		}

		const data = await res.json();

		// Handle safety blocks
		if (data?.promptFeedback?.blockReason) {
			throw new Error(`Blocked: ${data.promptFeedback.blockReason}`);
		}

		const parts = data?.candidates?.[0]?.content?.parts;
		if (!Array.isArray(parts) || parts.length === 0) {
			throw new Error('No content returned');
		}
		const text = parts.map((p: any) => p?.text ?? '').join('').trim();
		if (!text) throw new Error('Empty text result');
		return text;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class DailySummarySettingTab extends PluginSettingTab {
	plugin: DailySummaryPlugin;

	constructor(app: App, plugin: DailySummaryPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.createEl('h2', { text: 'Gemini API Settings' });

		new Setting(containerEl)
			.setName('Provider')
			.setDesc('Use local formatter (no API) or Gemini API')
			.addDropdown(drop => {
				drop.addOption('local', 'Local');
				drop.addOption('gemini', 'Gemini');
				drop.setValue(this.plugin.settings.provider);
				drop.onChange(async (value: Provider) => {
					this.plugin.settings.provider = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Enter your Google Gemini API key (AI Studio)')
			.addText(text =>
				text
					.setPlaceholder('API Key')
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Model')
			.setDesc('Gemini model to use (e.g., gemini-1.5-flash, gemini-1.5-pro)')
			.addText(text =>
				text
					.setPlaceholder('gemini-1.5-flash')
					.setValue(this.plugin.settings.model)
					.onChange(async (value) => {
						this.plugin.settings.model = value || 'gemini-1.5-flash';
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Add header before table')
			.setDesc('Insert a "🧾 Daily Summary" header before the table')
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.addHeader)
					.onChange(async (value) => {
						this.plugin.settings.addHeader = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
