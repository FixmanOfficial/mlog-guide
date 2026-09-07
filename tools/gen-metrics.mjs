/**
 * Снимает размеры интерфейса из исходников в `core/data/metrics.json`.
 *
 * Все эти числа лежат в Java литералами: `height(38)`, `t.margin(6f)`, `.size(24f).padRight(6)`,
 * `space = Scl.scl(10f)`. Раньше они переносились глазами в три места сразу — `theme.js`,
 * раскладки и CSS, — и разъезжались молча.
 *
 * Каждое число снимается **своим** шаблоном с якорем по соседнему коду. Если шаблон перестал
 * совпадать — генератор падает с именем размера, а не подставляет тихо старое значение: при
 * обновлении версии игры это единственный способ узнать, что раскладка поменялась.
 *
 *   node tools/gen-metrics.mjs <путь-к-Mindustry>
 */

import {readFileSync, writeFileSync} from 'node:fs'
import {join, resolve} from 'node:path'

const LOGIC = 'core/src/mindustry/logic'
const UI = 'core/src/mindustry/ui'

/**
 * Опись размеров. У каждого: файл, шаблон с одной или несколькими группами и имена,
 * которые этим группам соответствуют.
 */
const RECIPES = [
    // --- полотно и строка инструкции: LCanvas ---
    {file: `${LOGIC}/LCanvas.java`, names: ['canvasWidthNarrow', 'canvasWidth'],
        pattern: /targetWidth\s*=\s*useRows\(\)\s*\?\s*(\d+)f\s*:\s*(\d+)f/},
    {file: `${LOGIC}/LCanvas.java`, names: ['statementSpace'],
        pattern: /float space\s*=\s*Scl\.scl\((\d+)f\)/},
    {file: `${LOGIC}/LCanvas.java`, names: ['headerHeight'],
        pattern: /\}\)\.growX\(\)\.height\((\d+)\);/},
    {file: `${LOGIC}/LCanvas.java`, names: ['headerPadding'],
        pattern: /t\.margin\((\d+)f\);\s*\n\s*t\.touchable/},
    {file: `${LOGIC}/LCanvas.java`, names: ['namePadding'],
        pattern: /add\(st\.name\(\)\)[^;]*?\.padRight\((\d+)\)/s},
    {file: `${LOGIC}/LCanvas.java`, names: ['buttonSize', 'buttonGap'],
        pattern: /button\(Icon\.add[^;]*?\.size\((\d+)f\)\.padRight\((\d+)\)/s},
    {file: `${LOGIC}/LCanvas.java`, names: ['bodyPadding', 'bodyPaddingTop'],
        pattern: /\}\)\.pad\((\d+)\)\.padTop\((\d+)\)\.left\(\)\.grow\(\);/},
    {file: `${LOGIC}/LCanvas.java`, names: ['bodyMarginLeft'],
        pattern: /t\.marginLeft\((\d+)\);\s*\n\s*t\.setColor/},
    {file: `${LOGIC}/LCanvas.java`, names: ['statementMarginBottom'],
        pattern: /marginBottom\((\d+)\);/},
    {file: `${LOGIC}/LCanvas.java`, names: ['shadowPad', 'shadowBlur', 'shadowOpacity'],
        pattern: /float pad = (\d+)f;\s*\n\s*Fill\.dropShadow\([^;]*?,\s*(\d+)f,\s*([\d.]+)f \* parentAlpha\)/s},
    {file: `${LOGIC}/LCanvas.java`, names: ['statementFillAlpha'],
        pattern: /Draw\.color\(0, 0, 0, ([\d.]+)f \* parentAlpha\);/},
    {file: `${LOGIC}/LCanvas.java`, names: ['scrollMargin'],
        pattern: /if\(dst < Scl\.scl\((\d+)f\)\)/},
    {file: `${LOGIC}/LCanvas.java`, names: ['scrollSpeed'],
        pattern: /pane\.setScrollY\(pane\.getScrollY\(\) \+ sign \* Scl\.scl\((\d+)f\)/},
    {file: `${LOGIC}/LCanvas.java`, names: ['jumpStroke'],
        pattern: /Lines\.stroke\(Scl\.scl\((\d+)f\), button\.color\);/},
    {file: `${LOGIC}/LCanvas.java`, names: ['jumpLanePortrait', 'jumpLane', 'jumpLaneStepPortrait', 'jumpLaneStep'],
        pattern: /Scl\.scl\(Core\.graphics\.isPortrait\(\) \? (\d+)f : (\d+)f\) \+ Scl\.scl\(Core\.graphics\.isPortrait\(\) \? (\d+)f : (\d+)f\) \* \(float\) predHeight/},
    {file: `${LOGIC}/LCanvas.java`, names: ['rowsFactor'],
        pattern: /Core\.graphics\.getWidth\(\) < Scl\.scl\(900f\) \* ([\d.]+)f/},

    // --- поля и меню выбора: LStatement ---
    {file: `${LOGIC}/LStatement.java`, names: ['selectCellWidth', 'selectCellHeight'],
        pattern: /t\.defaults\(\)\.size\((\d+)f,\s*(\d+)f\);\s*\n\s*\n?\s*for\(T p : values\)/},
    {file: `${LOGIC}/LStatement.java`, names: ['selectColumns'], count: true,
        pattern: /showSelect\(b, values, current, getter, (\d+), c -> \{\}\)/},
    {file: `${LOGIC}/LStatement.java`, names: ['alignCellWidth', 'alignCellHeight'],
        pattern: /t\.defaults\(\)\.size\((\d+)f,\s*(\d+)f\);\s*\n\s*\n?\s*int i = 0;\s*\n\s*for\(String align/},
    {file: `${LOGIC}/LStatement.java`, names: ['alignColumns'], count: true,
        pattern: /if \(\+\+i % (\d+) == 0\) t\.row\(\);/},
    {file: `${LOGIC}/LStatement.java`, names: ['pencilSize'],
        pattern: /\}, Styles\.logict, \(\) -> \{\}\)\.size\((\d+)f\)\.color\(t\.color\)/},

    // --- HUD: миникарта, ресурсы ядра ---
    {file: 'core/src/mindustry/ui/Minimap.java', names: ['minimapSize'],
        pattern: /setSize\(Scl\.scl\((\d+)f\)\)/},
    {file: 'core/src/mindustry/ui/Minimap.java', names: ['minimapMargin'],
        pattern: /float margin = (\d+)f;/},
    {file: 'core/src/mindustry/ui/CoreItemsDisplay.java', names: ['coreItemsMargin'],
        pattern: /background\(Styles\.black6\);\s*\n\s*margin\((\d+)\);/},
    {file: 'core/src/mindustry/ui/CoreItemsDisplay.java', names: ['coreItemPad'],
        pattern: /image\(item\.uiIcon\)\.size\(iconSmall\)\.padRight\((\d+)\)/},
    {file: 'core/src/mindustry/ui/CoreItemsDisplay.java', names: ['coreAmountWidth'],
        pattern: /\.minWidth\((\d+)f\)\.left\(\)/},
    {file: 'core/src/mindustry/ui/CoreItemsDisplay.java', names: ['coreItemsColumns'], count: true,
        pattern: /if\(\+\+i % (\d+) == 0\)\{/},
    {file: 'core/src/mindustry/Vars.java', names: ['iconSmallFactor'],
        pattern: /iconSmall = 8\*(\d+)f/},

    // --- меню добавления и таблица переменных: LogicDialog ---
    {file: `${LOGIC}/LogicDialog.java`, names: ['addButtonWidth', 'addButtonHeight'],
        pattern: /\.size\((\d+)f, (\d+)f\)\.self\(c -> tooltip\(c, "lst\./},
    {file: `${LOGIC}/LogicDialog.java`, names: ['addColumns'], count: true,
        pattern: /if\(cat\.getChildren\(\)\.size % (\d+) == 0\) cat\.row\(\);/},
    {file: `${LOGIC}/LogicDialog.java`, names: ['addMaxHeight'],
        pattern: /\}\)\.fill\(\)\.maxHeight\(Core\.graphics\.getHeight\(\) \* ([\d.]+)f\)/},
    {file: `${LOGIC}/LogicDialog.java`, names: ['dialogButtonWidth', 'dialogButtonHeight'],
        pattern: /buttons\.defaults\(\)\.size\((\d+)f, (\d+)f\);/},
    {file: `${LOGIC}/LogicDialog.java`, names: ['editButtonWidth', 'editButtonHeight'],
        pattern: /t\.defaults\(\)\.size\((\d+)f, (\d+)f\)\.left\(\);/},
    {file: `${LOGIC}/LogicDialog.java`, names: ['varsRowHeight'],
        pattern: /t\.defaults\(\)\.fillX\(\)\.height\((\d+)f\);/},
    {file: `${LOGIC}/LogicDialog.java`, names: ['varsStub', 'varsDim', 'varsPad'],
        pattern: /float stub = (\d+)f, mul = ([\d.]+)f, pad = (\d+);/},
    {file: `${LOGIC}/LogicDialog.java`, names: ['varsValueWidth'],
        pattern: /\.padLeft\(4\)\.padRight\(4\)\.width\((\d+)f\)\.wrap\(\)/},
    {file: `${LOGIC}/LogicDialog.java`, names: ['varsTypeMinWidth'],
        pattern: /\}\}\)\.minWidth\((\d+)f\);/},
    {file: `${LOGIC}/LogicDialog.java`, names: ['globalsButtonWidth', 'globalsButtonHeight'],
        pattern: /"@logic\.globals", Icon\.list[^;]*?\.size\((\d+)f, (\d+)f\)/s},
    {file: `${LOGIC}/LogicDialog.java`, names: ['varsPeriod'],
        pattern: /float period = (\d+)f;/},

    // --- заголовок и закрытие диалога: BaseDialog ---
    {file: `${UI}/dialogs/BaseDialog.java`, names: ['dialogTitleRule', 'dialogTitlePad'],
        pattern: /titleImage = titleTable\.image\(Tex\.whiteui, Pal\.accent\)\.growX\(\)\.height\((\d+)f\)\.pad\((\d+)f\)/},
    {file: `${UI}/dialogs/BaseDialog.java`, names: ['closeButtonWidth'],
        pattern: /addCloseButton\((\d+)f\);/}
]

function main() {
    const gameRoot = resolve(process.argv[2] ?? '../Mindustry')
    const cache = new Map()

    const read = (file) => {
        if (!cache.has(file)) cache.set(file, readFileSync(join(gameRoot, file), 'utf8'))
        return cache.get(file)
    }

    const metrics = {}
    const counts = []
    const failed = []

    for (const {file, names, pattern, count} of RECIPES) {
        let source
        try {
            source = read(file)
        } catch {
            failed.push(`${names.join(', ')}: не найден ${file}`)
            continue
        }

        const match = source.match(pattern)

        if (match === null) {
            failed.push(`${names.join(', ')}: шаблон больше не совпадает в ${file}`)
            continue
        }

        names.forEach((name, index) => {
            metrics[name] = Number(match[index + 1])

            // Счётчик — это штуки, а не пиксели: столбцы в сетке кнопок, например
            if (count === true) counts.push(name)
        })
    }

    if (failed.length > 0) {
        console.error('Не сняты размеры — раскладка в игре поменялась:')
        for (const message of failed) console.error(`  ${message}`)
        process.exit(1)
    }

    writeFileSync('core/data/metrics.json', JSON.stringify({
        gameVersion: 'v159.7',
        source: 'core/src/mindustry/logic, core/src/mindustry/ui',
        note: 'Файл сгенерирован, править вручную нельзя. Все значения — литералы из исходников, '
            + 'снятые шаблонами с якорем по соседнему коду.',
        // Метрики-счётчики: у них нет единиц, и в CSS они идут без «px»
        counts,
        metrics
    }, null, 2) + '\n')

    console.log(`core/data/metrics.json: ${Object.keys(metrics).length} размеров`)
}

main()
