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
import {GAME_VERSION} from './version.mjs'

const LOGIC = 'core/src/mindustry/logic'
const UI = 'core/src/mindustry/ui'

/**
 * Опись размеров. У каждого: файл, шаблон с одной или несколькими группами и имена,
 * которые этим группам соответствуют.
 */
const RECIPES = [
    // --- полотно и строка инструкции: LCanvas ---
    /*
     * Ширина полотна. В v160 она перестала быть парой чисел: узкая осталась постоянной,
     * а широкая считается от ширины экрана и зажимается между двумя пределами
     * (`LCanvas.getTargetWidth`). Снимаются все три числа, а формулу повторяет страница.
     */
    {file: `${LOGIC}/LCanvas.java`, names: ['canvasWidthNarrow', 'canvasWidthMin', 'canvasWidth'],
        pattern: /isCompact\(\)\s*\?\s*(\d+)f\s*:\s*Mathf\.clamp\([^;]*?(\d+)f,\s*(\d+)f\)/s},
    {file: `${LOGIC}/LCanvas.java`, names: ['statementSpace'],
        pattern: /float space\s*=\s*Scl\.scl\((\d+)f\)/},
    {file: `${LOGIC}/LCanvas.java`, names: ['headerHeight'],
        pattern: /\}\)\.growX\(\)\.height\((\d+)\);/},
    {file: `${LOGIC}/LCanvas.java`, names: ['headerPadding'],
        pattern: /t\.margin\((\d+)f\);\s*\n\s*t\.touchable/},
    {file: `${LOGIC}/LCanvas.java`, names: ['namePadding'],
        pattern: /add\(st\.localizedName\(\)\)[^;]*?\.padRight\((\d+)\)/s},
    {file: `${LOGIC}/LCanvas.java`, names: ['buttonSize', 'buttonGap'],
        pattern: /button\(Icon\.add[^;]*?\.size\((\d+)f\)\.padRight\((\d+)\)/s},
    {file: `${LOGIC}/LCanvas.java`, names: ['bodyPadding', 'bodyPaddingTop'],
        pattern: /add\(t\)\.pad\((\d+)\)\.padTop\((\d+)\)\.left\(\)\.grow\(\);/},
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
    /*
     * Порог узкой раскладки: `isCompact`. До v160 это число совпадало с широкой шириной
     * полотна, и мы брали его оттуда; теперь полотно тянется до 1200, а порог остался
     * своим, и снимать его нужно отдельно.
     */
    {file: `${LOGIC}/LCanvas.java`, names: ['compactWidth', 'rowsFactor'],
        pattern: /Core\.graphics\.getWidth\(\) < Scl\.scl\((\d+)f\) \* ([\d.]+)f/},

    // --- поля и меню выбора: LStatement ---
    /*
     * Поле ввода. В v160 оно выросло со 144 до 180, а подписанное — с 85 до тех же 180,
     * и наша вёрстка этого не заметила: числа лежали в CSS литералами. Теперь их снимает
     * генератор, и следующее такое изменение молча не пройдёт.
     */
    {file: `${LOGIC}/LStatement.java`, names: ['fieldWidth', 'fieldHeight', 'fieldPad'],
        pattern: /Styles\.nodeField[^;]*?\.size\((\d+)f,\s*(\d+)f\)\.pad\((\d+)f\)/s},
    {file: `${LOGIC}/LStatement.java`, names: ['labeledFieldWidth'],
        pattern: /float width = (\d+)f;\s*String text = bundle\(desc\);/s},
    {file: `${LOGIC}/LStatement.java`, names: ['labelPadLeft', 'labeledFieldPadRight'],
        pattern: /sub\.add\(text\)\.padLeft\((\d+)\)[^;]*;\s*return field\(sub, value, setter\)\.width\(width\)\.padRight\((\d+)\)/s},
    /*
     * Узкая раскладка ставит подпись не перед полем, а после него — `nameAfterField`.
     * Отступы у неё свои: 4 у поля, 12 у подписи.
     */
    {file: `${LOGIC}/LStatement.java`, names: ['compactFieldPadRight', 'compactLabelPadRight'],
        pattern: /field\(sub, value, setter\)\.width\(width\)\.padRight\((\d+)f\)\.left\(\);\s*sub\.add\(text\)\.padRight\((\d+)f\)/s},
    /*
     * Поле свойства у `sensor` — единственное со своей шириной: в v160.2 ему задали
     * 140 в узкой раскладке и 180 в широкой. LStatements.SensorStatement.build
     */
    {file: `${LOGIC}/LStatements.java`, names: ['sensorFieldCompactWidth', 'sensorFieldWidth'],
        pattern: /tfield = field\(table, type, str -> type = str\)\.width\(LCanvas\.isCompact\(\) \? (\d+)f : (\d+)f\)/},

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

    // --- панель строительства: PlacementFragment ---
    {file: `${UI}/fragments/PlacementFragment.java`, names: ['blockRowWidth'], count: true,
        pattern: /final int rowWidth = (\d+);/},
    {file: `${UI}/fragments/PlacementFragment.java`, names: ['blockTableMargin'],
        pattern: /blockTable\.top\(\)\.margin\((\d+)\);/},
    {file: `${UI}/fragments/PlacementFragment.java`, names: ['blockButtonSize'],
        pattern: /\}\)\.size\((\d+)f\)\.group\(group\)\.name\("block-"/},
    {file: `${UI}/fragments/PlacementFragment.java`, names: ['categoryButtonSize'],
        pattern: /categories\.defaults\(\)\.size\((\d+)f\);/},
    {file: `${UI}/fragments/PlacementFragment.java`, names: ['categoryColumns'], count: true,
        pattern: /if\(f\+\+ % (\d+) == 0\) categories\.row\(\);/},
    {file: 'core/src/mindustry/Vars.java', names: ['iconMedFactor'],
        pattern: /iconMed = 8\*(\d+)f/},

    // --- панель строительства: раскладка целиком ---
    {file: `${UI}/fragments/PlacementFragment.java`, names: ['blockPaneHeight'],
        pattern: /blocksSelect\.pane\(blocks -> blockTable = blocks\)\.height\((\d+)f\)/},
    {file: `${UI}/fragments/PlacementFragment.java`, names: ['blocksMargin', 'blocksMarginTop'],
        pattern: /blocksSelect\.margin\((\d+)\)\.marginTop\((\d+)\);/},
    {file: `${UI}/fragments/PlacementFragment.java`, names: ['categoryLineHeight'],
        pattern: /t\.image\(\)\.color\(Pal\.gray\)\.height\((\d+)f\)\.colspan\(4\)\.growX\(\);/},
    {file: `${UI}/fragments/PlacementFragment.java`, names: ['blockNameWidth', 'blockNamePad'],
        pattern: /\.left\(\)\.width\((\d+)f\)\.padLeft\((\d+)\);/},
    {file: `${UI}/fragments/PlacementFragment.java`, names: ['blockInfoFactor'],
        pattern: /\}\)\.size\(8 \* (\d+)\)\.padTop\(-5\)\.padRight\(-5\)/},
    {file: `${UI}/fragments/PlacementFragment.java`, names: ['requirementIconFactor'],
        pattern: /line\.image\(stack\.item\.uiIcon\)\.size\(8 \* (\d+)\);/},
    {file: `${UI}/fragments/PlacementFragment.java`, names: ['requirementNameWidth'],
        pattern: /\.maxWidth\((\d+)f\)\.fillX\(\)\.color\(Color\.lightGray\)/},
    {file: 'core/src/mindustry/input/DesktopInput.java', names: ['placementRowSize'],
        pattern: /table\.left\(\)\.margin\(0f\)\.defaults\(\)\.size\((\d+)f\)\.left\(\);/},

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
        gameVersion: GAME_VERSION,
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
