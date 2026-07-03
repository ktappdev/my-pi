import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import type { ExtensionUIContext } from "@mariozechner/pi-coding-agent";
import { Container, fuzzyFilter, getKeybindings, Input, type SelectItem, SelectList, Text } from "@mariozechner/pi-tui";

const SESSION_DEFAULT = "(use session default)";
const CUSTOM_MODEL = "__custom_model__";

export async function chooseAgentModelWithFuzzyPicker(
	ui: ExtensionUIContext,
	targetLabel: string,
	availableModels: string[],
	currentModel: string,
): Promise<string | undefined> {
	const items: SelectItem[] = [
		{
			value: SESSION_DEFAULT,
			label: currentModel === SESSION_DEFAULT ? `${SESSION_DEFAULT} (current)` : SESSION_DEFAULT,
			description: "Clear the project-local override for this agent.",
		},
		...availableModels.map((model) => ({
			value: model,
			label: model === currentModel ? `${model} (current)` : model,
			description: "",
		})),
		{
			value: CUSTOM_MODEL,
			label: "Enter custom model...",
			description: "Type any provider/model manually.",
		},
	];

	const choice = await ui.custom<string | null>((tui, theme, _kb, done) => {
		const container = new Container();
		container.addChild(new DynamicBorder((str) => theme.fg("accent", str)));
		container.addChild(new Text(theme.fg("accent", theme.bold(`Model for ${targetLabel}`))));
		const searchInput = new Input();

		const selectList = new SelectList(items, 12, {
			selectedPrefix: (text) => theme.fg("accent", text),
			selectedText: (text) => theme.fg("accent", text),
			description: (text) => theme.fg("muted", text),
			scrollInfo: (text) => theme.fg("dim", text),
			noMatch: (text) => theme.fg("warning", text),
		});

		selectList.onSelect = (item) => done(String(item.value));
		selectList.onCancel = () => done(null);

		const applyFilter = () => {
			const query = searchInput.getValue().trim();
			const filtered = query
				? fuzzyFilter(items, query, (item) => `${item.label} ${item.description || ""}`)
				: items;
			(selectList as any).filteredItems = filtered;
			const currentIndex = filtered.findIndex((item) => item.value === currentModel);
			selectList.setSelectedIndex(currentIndex >= 0 ? currentIndex : 0);
		};

		applyFilter();

		container.addChild(new Text(theme.fg("dim", "Search")));
		container.addChild(searchInput);
		container.addChild(selectList);
		container.addChild(new Text(theme.fg("dim", "type to fuzzy filter • ↑↓ navigate • enter select • esc cancel")));
		container.addChild(new DynamicBorder((str) => theme.fg("accent", str)));

		return {
			render(width: number) {
				return container.render(width);
			},
			invalidate() {
				container.invalidate();
			},
			handleInput(data: string) {
				const kb = getKeybindings();
				if (
					kb.matches(data, "tui.select.up") ||
					kb.matches(data, "tui.select.down") ||
					kb.matches(data, "tui.select.confirm") ||
					kb.matches(data, "tui.select.cancel")
				) {
					selectList.handleInput(data);
				} else {
					searchInput.handleInput(data);
					applyFilter();
				}
				tui.requestRender();
			},
		};
	});

	if (!choice) {
		return undefined;
	}

	if (choice === CUSTOM_MODEL) {
		const custom = await ui.input(
			`Enter model for ${targetLabel}`,
			currentModel !== SESSION_DEFAULT ? currentModel : "provider/model",
		);
		return custom?.trim() || undefined;
	}

	return choice;
}
