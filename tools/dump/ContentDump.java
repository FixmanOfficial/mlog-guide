import arc.Core;
import arc.Settings;
import arc.util.Log;

import mindustry.Vars;
import mindustry.core.ContentLoader;
import mindustry.ctype.Content;
import mindustry.ctype.ContentType;
import mindustry.ctype.UnlockableContent;
import mindustry.game.Team;
import mindustry.gen.Crawlc;
import mindustry.gen.Legsc;
import mindustry.gen.Mechc;
import mindustry.gen.Tankc;
import mindustry.type.Item;
import mindustry.type.ItemStack;
import mindustry.type.Liquid;
import mindustry.type.StatusEffect;
import mindustry.type.UnitType;
import mindustry.content.Blocks;
import mindustry.world.Block;
import mindustry.world.blocks.defense.turrets.BaseTurret;
import mindustry.world.blocks.logic.LogicBlock;
import mindustry.world.blocks.logic.LogicDisplay;
import mindustry.world.blocks.logic.MemoryBlock;
import mindustry.world.blocks.logic.MessageBlock;
import mindustry.world.blocks.storage.CoreBlock;
import mindustry.world.blocks.distribution.ChainedBuilding;
import mindustry.world.blocks.environment.Floor;
import mindustry.world.blocks.environment.OreBlock;
import mindustry.world.blocks.environment.OverlayFloor;
import mindustry.world.blocks.environment.Prop;
import mindustry.world.blocks.distribution.Conveyor;
import mindustry.world.blocks.distribution.Router;
import mindustry.world.blocks.production.Drill;
import mindustry.world.blocks.production.GenericCrafter;
import mindustry.world.consumers.Consume;
import mindustry.world.consumers.ConsumeItems;
import mindustry.world.consumers.ConsumeLiquid;
import mindustry.world.consumers.ConsumeLiquids;
import mindustry.world.consumers.ConsumePower;
import mindustry.world.blocks.environment.StaticWall;
import mindustry.world.blocks.environment.TallBlock;
import mindustry.world.meta.BuildVisibility;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;

import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Выгружает спеки контента из самой игры.
 *
 * Разбором Java-исходников снять их нельзя: половина чисел не записана, а выводится
 * в `init()`. Дальность юнита собирается из скорости и времени жизни пуль каждого оружия,
 * здоровье блока — из размера и состава, вместимость — из размера корпуса. Поэтому игра
 * поднимается по-настоящему: `ContentLoader.createBaseContent()` и `init()` делают ровно то же,
 * что при запуске, только без графики и звука.
 *
 * Запускать через `tools/gen-dump.mjs` — он находит JDK, собирает и кладёт результат
 * в `core/data`.
 */
public class ContentDump{
    /** Версия игры, из которой сняты данные. Проверяется на совпадение с ожидаемой. */
    static final String VERSION = "v159.7";

    public static void main(String[] args) throws Exception{
        if(args.length < 5){
            System.err.println("нужны пять путей: <unit-specs.json> <block-specs.json> "
                + "<teams.json> <materials.json> <stats.json>");
            System.exit(1);
        }

        // Игра шумит в лог даже без графики; на выгрузку это не влияет, но мешает читать
        Log.logger = (level, text) -> { };

        Vars.headless = true;
        Vars.loadLocales = false;

        // Единственное, что нужно контенту снаружи: настройки читает Planet.loadRules
        Core.settings = new Settings();

        Vars.content = new ContentLoader();
        Vars.content.createBaseContent();
        Vars.content.init();

        write(Path.of(args[0]), units());
        write(Path.of(args[1]), blocks());
        write(Path.of(args[2]), teams());
        write(Path.of(args[3]), materials());
        write(Path.of(args[4]), stats());

        System.out.println(Vars.content.units().size + " " + Vars.content.blocks().size);
    }

    static String units(){
        Json out = new Json();
        out.string("gameVersion", VERSION);
        out.string("source", "ContentLoader.init() в самой игре, tools/dump/ContentDump.java");
        out.string("note", "Файл сгенерирован, править вручную нельзя. Значения сняты после "
            + "UnitType.init(), то есть уже с выведенными дальностью и вместимостью.");

        // Логического идентификатора здесь нет намеренно: он лежит в logicids.dat и снимается
        // отдельным генератором, а здесь потребовал бы поднимать ещё и GlobalVars с ассетами
        Json units = new Json();

        for(UnitType type : Vars.content.units()){
            Json unit = new Json();

            unit.number("health", type.health);
            unit.number("armor", type.armor);
            unit.number("hitSize", type.hitSize);

            unit.number("speed", type.speed);
            unit.number("accel", type.accel);
            unit.number("drag", type.drag);
            unit.number("rotateSpeed", type.rotateSpeed);
            unit.number("floorMultiplier", type.floorMultiplier);
            unit.number("strafePenalty", type.strafePenalty);
            unit.number("boostMultiplier", type.boostMultiplier);
            unit.number("riseSpeed", type.riseSpeed);
            unit.number("descentSpeed", type.descentSpeed);

            unit.number("range", type.range);
            unit.number("maxRange", type.maxRange);
            unit.number("mineRange", type.mineRange);
            unit.number("buildRange", type.buildRange);

            unit.number("itemCapacity", type.itemCapacity);
            unit.number("payloadCapacity", type.payloadCapacity);
            unit.number("mineTier", type.mineTier);
            unit.number("mineSpeed", type.mineSpeed);
            unit.bool("mineFloor", type.mineFloor);
            unit.bool("mineWalls", type.mineWalls);
            unit.bool("mineHardnessScaling", type.mineHardnessScaling);
            unit.number("buildSpeed", type.buildSpeed);

            unit.bool("flying", type.flying);
            unit.bool("omniMovement", type.omniMovement);
            unit.bool("rotateMoveFirst", type.rotateMoveFirst);
            unit.bool("canBoost", type.canBoost);
            unit.bool("hovering", type.hovering);
            unit.bool("logicControllable", type.logicControllable);
            unit.bool("playerControllable", type.playerControllable);
            unit.bool("targetable", type.targetable);
            unit.bool("bounded", type.bounded);
            unit.bool("internal", type.internal);

            // Как юнит устроен: от этого зависит и движение, и отрисовка. Мех поворачивается
            // отдельным углом ног, у танка гусеницы, у паука ноги с обратной кинематикой
            unit.bool("mech", type.sample instanceof Mechc);
            unit.bool("tank", type.sample instanceof Tankc);
            unit.bool("legged", type.sample instanceof Legsc);
            unit.bool("crawl", type.sample instanceof Crawlc);

            unit.number("baseRotateSpeed", type.baseRotateSpeed);
            unit.number("mechStride", type.mechStride);
            unit.number("mechSideSway", type.mechSideSway);
            unit.number("mechFrontSway", type.mechFrontSway);
            unit.string("mechLegColor", color(type.mechLegColor));

            // Огонь двигателей рисуется кругами, а не спрайтом: цвет, радиус и место
            unit.bool("useEngineElevation", type.useEngineElevation);
            unit.raw("engineColor", type.engineColor == null ? "null" : "\"" + color(type.engineColor) + "\"");
            unit.string("engineColorInner", color(type.engineColorInner));

            List<String> engines = new ArrayList<>();
            for(UnitType.UnitEngine engine : type.engines){
                engines.add("{\"x\": " + engine.x + ", \"y\": " + engine.y
                    + ", \"radius\": " + engine.radius + ", \"rotation\": " + engine.rotation + "}");
            }
            unit.raw("engines", "[" + String.join(", ", engines) + "]");

            unit.bool("canMine", type.mineTier >= 0);
            unit.bool("canBuild", type.buildSpeed > 0);
            unit.number("weapons", type.weapons.size);

            units.raw(type.name, unit.object());
        }

        out.raw("units", units.object());
        return out.object();
    }

    static String blocks() throws Exception{
        Json out = new Json();
        out.string("gameVersion", VERSION);
        out.string("source", "ContentLoader.init() в самой игре, tools/dump/ContentDump.java");
        out.string("note", "Файл сгенерирован, править вручную нельзя. Здоровье снято после "
            + "Block.init(), где оно выводится из размера и состава.");

        Json blocks = new Json();

        for(Block block : Vars.content.blocks()){
            Json spec = new Json();

            // Внутренний идентификатор контента: по нему игра решает, чей край рисуется поверх
            spec.number("id", block.id);
            spec.number("size", block.size);
            spec.number("health", block.health);
            spec.number("armor", block.armor);
            spec.number("offset", block.offset);

            spec.bool("solid", block.solid);
            spec.bool("rotate", block.rotate);
            spec.bool("configurable", block.configurable);
            spec.bool("hasItems", block.hasItems);
            spec.bool("hasLiquids", block.hasLiquids);
            spec.bool("hasPower", block.hasPower);
            spec.bool("unloadable", block.unloadable);
            /*
             * Разбирается ли блок — три поля, а не одно: `Tile.breakable()` это
             * `destructible || breakable || update`. У обычной постройки поднят
             * `destructible`, а `breakable` есть у декораций вроде кустов.
             */
            spec.bool("breakable", block.breakable);
            spec.bool("destructible", block.destructible);
            spec.bool("update", block.update);
            spec.bool("placeableOn", block.placeableOn);
            spec.bool("synthetic", block.synthetic());

            // Привилегированный блок ставится только в редакторе карт, и его логике
            // доступны инструкции мира. Block.privileged
            spec.bool("privileged", block.privileged);

            // Ядро: по нему считает `fetch core` и ищет `ulocate building core`
            spec.bool("core", block instanceof CoreBlock);

            spec.number("itemCapacity", block.itemCapacity);
            spec.number("liquidCapacity", block.liquidCapacity);

            /*
             * Цвет на карте. Часть блоков получает его в конструкторе — у руды это цвет
             * её предмета, — а остальным его ставит `ContentLoader.loadColors` из картинки.
             * Здесь берётся то, что уже посчитала игра; картинку накладывает генератор.
             */
            spec.string("mapColor", color(block.mapColor));
            spec.bool("useColor", block.useColor);

            /*
             * Цепочка классов блока в игре, от своего до `Block`. Нужна справочнику:
             * свойства вроде `@shield` или `@currentAmmoType` объявлены не в базовом
             * `Block`, а в конкретном классе, и без этой связи нельзя сказать, у каких
             * блоков они читаются.
             *
             * Почти все блоки в `Blocks.java` заведены анонимными подклассами
             * (`new Wall("door"){{ ... }}`), а у анонимного класса простого имени нет
             * вовсе — поэтому такие пропускаются.
             */
            List<String> chain = new ArrayList<>();
            for(Class<?> type = block.getClass(); type != null; type = type.getSuperclass()){
                if(!type.isAnonymousClass()) chain.add(type.getSimpleName());
                if(type == Block.class) break;
            }
            spec.strings("javaClasses", chain);

            spec.string("category", block.category.name());
            spec.string("group", block.group.name());
            spec.string("buildVisibility", visibilityName(block.buildVisibility));
            spec.bool("canBeBuilt", block.canBeBuilt());

            // Логические блоки: то, ради чего эта таблица вообще появилась
            if(block instanceof LogicBlock logic){
                spec.number("ipt", logic.instructionsPerTick);
                spec.number("range", logic.range);
                spec.number("maxInstructionScale", logic.maxInstructionScale);
                spec.number("maxInstructionsPerTick", logic.maxInstructionsPerTick);
            }

            // Дальность турели: сама турель не моделируется, но `radar` смотрит именно на неё
            if(block instanceof BaseTurret turret){
                spec.number("range", turret.range);
            }

            if(block instanceof MemoryBlock memory){
                spec.number("memoryCapacity", memory.memoryCapacity);
            }

            if(block instanceof LogicDisplay display){
                spec.number("displaySize", display.displaySize);
            }

            if(block instanceof MessageBlock message){
                spec.number("maxTextLength", message.maxTextLength);
                spec.number("maxNewlines", message.maxNewlines);
            }

            /*
             * Производство. Без этих чисел база в песочнице мёртвая: бур не копает, фабрика
             * не варит, а `@progress` и `@totalItems` не меняются вовсе.
             *
             * `dumpTime` есть у любого блока: с этой частотой он пытается отдать содержимое
             * соседям (`BuildingComp.dump`).
             */
            spec.number("dumpTime", block.dumpTime);

            /*
             * Мгновенная передача. Маршрутизатор отдаёт соседу сразу, если тот не такой же
             * маршрутизатор и не сортировщик: иначе предметы бегали бы между ними кругами.
             * Router.updateTile
             */
            spec.bool("instantTransfer", block.instantTransfer);

            /*
             * Быстрый поворот: колесо с зажатой R крутит уже поставленный блок, но не всякий.
             * У сортировщика и моста этого нет — им поворот не нужен. Block.quickRotate
             */
            spec.bool("quickRotate", block.quickRotate);

            /*
             * Как блок ставится протяжкой. Стена заполняет прямоугольник, конвейер тянется
             * линией и разворачивается по ходу, а часть блоков поворот линии игнорирует.
             * InputHandler.iterateLine
             */
            spec.bool("conveyorPlacement", block.conveyorPlacement);
            spec.bool("allowRectanglePlacement", block.allowRectanglePlacement);
            spec.bool("allowDiagonal", block.allowDiagonal);
            spec.bool("ignoreLineRotation", block.ignoreLineRotation);

            /*
             * Замена блока блоком. Конвейер ставится поверх конвейера — так его и
             * поворачивают на углу, — а стена поверх стены: `group.anyReplace`. Правила
             * лежат в `Block.canReplace`, и им нужны четыре поля разом.
             */
            spec.bool("replaceable", block.replaceable);
            spec.bool("alwaysReplace", block.alwaysReplace);
            spec.bool("groupAnyReplace", block.group.anyReplace);
            if(block.subclass != null) spec.string("subclass", block.subclass.getSimpleName());

            /*
             * Звено цепи. `ChainedBuilding` это конвейеры и трубы: линия, доведённая до
             * такого блока, не разворачивает его, а берёт его поворот себе.
             * InputHandler.iterateLine
             */
            spec.bool("chained", chained(block));

            if(block instanceof Conveyor conveyor){
                spec.number("speed", conveyor.speed);
                spec.number("displayedSpeed", conveyor.displayedSpeed);
            }

            if(block instanceof Router router){
                spec.number("speed", router.speed);
            }

            if(block instanceof Drill drill){
                spec.number("tier", drill.tier);
                spec.number("drillTime", drill.drillTime);
                spec.number("hardnessDrillMultiplier", drill.hardnessDrillMultiplier);
                spec.number("liquidBoostIntensity", drill.liquidBoostIntensity);
                spec.number("warmupSpeed", drill.warmupSpeed);

                List<String> blocked = new ArrayList<>();
                if(drill.blockedItem != null) blocked.add("\"" + drill.blockedItem.name + "\"");
                if(drill.blockedItems != null){
                    for(Item item : drill.blockedItems) blocked.add("\"" + item.name + "\"");
                }
                if(!blocked.isEmpty()) spec.raw("blockedItems", "[" + String.join(", ", blocked) + "]");

                // Ускорители под отдельные предметы: у пневматического бура их нет, у титанового есть
                List<String> multipliers = new ArrayList<>();
                for(Item item : Vars.content.items()){
                    float value = drill.drillMultipliers.get(item, 1f);
                    if(value != 1f) multipliers.add("\"" + item.name + "\": " + value);
                }
                if(!multipliers.isEmpty()){
                    spec.raw("drillMultipliers", "{" + String.join(", ", multipliers) + "}");
                }
            }

            if(block instanceof GenericCrafter crafter){
                spec.number("craftTime", crafter.craftTime);
                spec.number("warmupSpeed", crafter.warmupSpeed);

                if(crafter.outputItems != null) spec.raw("outputItems", stacks(crafter.outputItems));
                if(crafter.outputLiquids != null){
                    List<String> liquids = new ArrayList<>();
                    for(var stack : crafter.outputLiquids){
                        liquids.add("{\"liquid\": \"" + stack.liquid.name + "\", \"amount\": " + stack.amount + "}");
                    }
                    spec.raw("outputLiquids", "[" + String.join(", ", liquids) + "]");
                }
            }

            /*
             * Что блок потребляет. Игра держит это списком объектов, а не полями: предметы,
             * энергия и жидкости лежат каждый своим `Consume`. Необязательные (`optional`)
             * не мешают работать, а только ускоряют — вода в буре именно такая.
             */
            List<String> consumes = new ArrayList<>();
            for(Consume consume : block.consumers){
                String entry = consume(consume);
                if(entry != null) consumes.add(entry);
            }
            if(!consumes.isEmpty()) spec.raw("consumes", "[" + String.join(", ", consumes) + "]");

            // Среда: пол, руда, статичная стена. Отличать их обязательно — рисуются они
            // по-разному, а `ucontrol getBlock` отдаёт пол и руду отдельно от здания
            String kind = kind(block);
            if(kind != null) spec.string("kind", kind);

            if(block.variants > 0) spec.number("variants", block.variants);
            if(block.itemDrop != null) spec.string("itemDrop", block.itemDrop.name);

            if(block instanceof Floor floor){
                spec.number("speedMultiplier", floor.speedMultiplier);
                spec.number("dragMultiplier", floor.dragMultiplier);
                spec.bool("isLiquid", floor.isLiquid);
                spec.bool("drawEdgeIn", floor.drawEdgeIn);
                spec.bool("drawEdgeOut", floor.drawEdgeOut);
                spec.bool("hasSurface", floor.hasSurface());

                // Группа смешивания: край рисует не сам пол, а его группа. Floor.blendGroup
                if(floor.blendGroup != floor) spec.string("blendGroup", floor.blendGroup.name);
                if(floor.wall != Blocks.air) spec.string("wall", floor.wall.name);
            }

            List<String> requirements = new ArrayList<>();
            for(ItemStack stack : block.requirements){
                requirements.add("{\"item\": \"" + stack.item.name + "\", \"amount\": " + stack.amount + "}");
            }
            spec.raw("requirements", "[" + String.join(", ", requirements) + "]");

            blocks.raw(block.name, spec.object());
        }

        out.raw("blocks", blocks.object());
        return out.object();
    }

    /** Набор предметов с количествами — тем же видом, что и требования на постройку. */
    static String stacks(ItemStack[] items){
        List<String> parts = new ArrayList<>();
        for(ItemStack stack : items){
            parts.add("{\"item\": \"" + stack.item.name + "\", \"amount\": " + stack.amount + "}");
        }
        return "[" + String.join(", ", parts) + "]";
    }

    /**
     * Одно потребление. Видов в игре больше, чем здесь, но остальные — про воду для щита,
     * нажатие игроком и прочее, чего в модели нет; они пропускаются, и это видно по тому,
     * что в описи их нет.
     */
    static String consume(Consume consume){
        String tail = ", \"optional\": " + (consume.optional ? "true" : "false")
            + ", \"boost\": " + (consume.booster ? "true" : "false") + "}";

        if(consume instanceof ConsumeItems items){
            return "{\"kind\": \"items\", \"items\": " + stacks(items.items) + tail;
        }

        if(consume instanceof ConsumePower power){
            return "{\"kind\": \"power\", \"usage\": " + power.usage
                + ", \"capacity\": " + power.capacity
                + ", \"buffered\": " + (power.buffered ? "true" : "false") + tail;
        }

        if(consume instanceof ConsumeLiquid liquid){
            return "{\"kind\": \"liquid\", \"liquid\": \"" + liquid.liquid.name
                + "\", \"amount\": " + liquid.amount + tail;
        }

        if(consume instanceof ConsumeLiquids liquids){
            List<String> parts = new ArrayList<>();
            for(var stack : liquids.liquids){
                parts.add("{\"liquid\": \"" + stack.liquid.name + "\", \"amount\": " + stack.amount + "}");
            }
            return "{\"kind\": \"liquids\", \"liquids\": [" + String.join(", ", parts) + "]" + tail;
        }

        return null;
    }

    /**
     * `BuildVisibility` — не enum, а класс со статическими экземплярами, и спросить у него имя
     * нельзя. Спрашивать `visible()` тем более: половина условий там смотрит в `Vars.state`,
     * которого без запущенной игры нет. Поэтому имя достаётся отражением по совпадению ссылки.
     */
    /**
     * Звено ли это цепи. `ChainedBuilding` реализует не блок, а его здание, поэтому здание
     * приходится завести — вне мира, только чтобы спросить о типе.
     */
    static boolean chained(Block block){
        try{
            return block.buildType.get() instanceof ChainedBuilding;
        }catch(Throwable ignored){
            return false;
        }
    }

    static String visibilityName(BuildVisibility visibility) throws Exception{
        for(Field field : BuildVisibility.class.getFields()){
            if(Modifier.isStatic(field.getModifiers()) && field.get(null) == visibility) return field.getName();
        }
        return "unknown";
    }

    /**
     * Что это за блок с точки зрения карты. Порядок проверок важен: руда это тоже наложение,
     * а наложение — тоже пол.
     */
    /**
     * Поля, которые в опись не идут. Это не отбор характеристик — характеристики берутся все, —
     * а служебные поля упаковки, локализации и базы знаний: имя и номер лежат ключом, переводы
     * снимает `gen-bundles.mjs`, а до того, как рисуются иконки, справочнику дела нет.
     */
    static final java.util.Set<String> SKIP = java.util.Set.of(
        "name", "id", "localizedName", "description", "details", "fullOverride",
        "generateIcons", "selectionSize", "hideDetails", "hideDatabase", "databaseCategory",
        "databaseTag", "allDatabaseTabs", "inlineDescription", "removed", "iconId",
        "minfo", "unlocked", "alwaysUnlocked"
    );

    /**
     * Полная опись характеристик: всё, что игра держит открытым числом, флагом, перечислением,
     * цветом или ссылкой на контент.
     *
     * Собирается отражением, а не списком полей, и это осознанно: списки устаревают молча.
     * Смоделировано у нас далеко не всё — дальность турели, время перезарядки, потребление
     * энергии, — но в справочнике это те самые числа, за которыми туда и приходят. Пусть
     * лежат снятыми из игры, а не переписанными с вики.
     *
     * В модель мира этот файл не идёт: он большой, а `world.js` попадает в сборку сайта.
     * Отсюда и разделение — `block-specs.json` для движка, `stats.json` для справочника.
     */
    static String stats() throws Exception{
        Json out = new Json();
        out.string("gameVersion", VERSION);
        out.string("source", "публичные поля контента, отражение по ContentDump.java");
        out.string("note", "Файл сгенерирован, править вручную нельзя. Здесь всё, что игра "
            + "держит числом или флагом, включая то, что мы не моделируем.");

        Json sections = new Json();

        for(ContentType type : new ContentType[]{ContentType.unit, ContentType.block,
            ContentType.item, ContentType.liquid}){

            Json section = new Json();
            for(Content content : Vars.content.getBy(type)){
                if(content instanceof UnlockableContent named){
                    section.raw(named.name, fields(named));
                }
            }
            sections.raw(type.name(), section.object());
        }

        out.raw("stats", sections.object());
        return out.object();
    }

    /**
     * Публичные поля объекта, годные для таблицы. Берутся числа, флаги, строки, перечисления,
     * цвета и ссылки на другой контент; всё остальное — спрайты, звуки, эффекты, списки —
     * пропускается: в справочнике от них толку нет, а размер они утроят.
     */
    static String fields(UnlockableContent content) throws Exception{
        Json json = new Json();

        for(Field field : content.getClass().getFields()){
            if(Modifier.isStatic(field.getModifiers())) continue;
            if(SKIP.contains(field.getName())) continue;

            Object value;
            try{
                value = field.get(content);
            }catch(Exception ignored){
                continue;
            }

            if(value == null) continue;

            String name = field.getName();
            Class<?> kind = field.getType();

            if(kind == int.class || kind == short.class || kind == byte.class || kind == long.class){
                json.number(name, ((Number)value).intValue());
            }else if(kind == float.class || kind == double.class){
                json.number(name, ((Number)value).floatValue());
            }else if(kind == boolean.class){
                json.bool(name, (Boolean)value);
            }else if(value instanceof arc.graphics.Color color){
                json.string(name, color(color));
            }else if(value instanceof Enum<?> item){
                json.string(name, item.name());
            }else if(value instanceof UnlockableContent other){
                json.string(name, other.name);
            }else if(value instanceof String text && text.length() < 200){
                json.string(name, text);
            }
        }

        return json.object();
    }

    /**
     * Предметы и жидкости: цвет и твёрдость. Твёрдость решает, кто что может добывать
     * (`mineTier >= hardness`) и сколько это займёт времени.
     */
    static String materials(){
        Json out = new Json();
        out.string("gameVersion", VERSION);
        out.string("source", "ContentLoader.init() в самой игре, tools/dump/ContentDump.java");
        out.string("note", "Файл сгенерирован, править вручную нельзя.");

        Json items = new Json();
        for(Item item : Vars.content.items()){
            Json entry = new Json();
            entry.string("color", color(item.color));
            entry.number("hardness", item.hardness);
            entry.number("cost", item.cost);
            entry.number("explosiveness", item.explosiveness);
            entry.number("flammability", item.flammability);
            entry.number("radioactivity", item.radioactivity);
            entry.number("charge", item.charge);
            entry.bool("buildable", item.buildable);

            /*
             * Порядок для бура: при выборе, что копать, игра сначала откидывает предметы
             * с `lowPriority` (песок под водой), потом смотрит, каких клеток больше, и лишь
             * потом — на номер. Drill.countOre
             */
            entry.bool("lowPriority", item.lowPriority);
            entry.number("id", item.id);
            items.raw(item.name, entry.object());
        }

        Json liquids = new Json();
        for(Liquid liquid : Vars.content.liquids()){
            Json entry = new Json();
            entry.string("color", color(liquid.color));
            entry.number("heatCapacity", liquid.heatCapacity);
            entry.number("temperature", liquid.temperature);
            entry.number("viscosity", liquid.viscosity);
            entry.number("explosiveness", liquid.explosiveness);
            entry.number("flammability", liquid.flammability);
            liquids.raw(liquid.name, entry.object());
        }

        // Эффекты состояния: `status` вешает их на юнита, а они правят его множители
        Json statuses = new Json();
        for(StatusEffect effect : Vars.content.<StatusEffect>getBy(ContentType.status)){
            Json entry = new Json();

            entry.number("damageMultiplier", effect.damageMultiplier);
            entry.number("healthMultiplier", effect.healthMultiplier);
            entry.number("speedMultiplier", effect.speedMultiplier);
            entry.number("reloadMultiplier", effect.reloadMultiplier);
            entry.number("buildSpeedMultiplier", effect.buildSpeedMultiplier);
            entry.number("dragMultiplier", effect.dragMultiplier);

            entry.number("damage", effect.damage);
            entry.number("intervalDamage", effect.intervalDamage);
            entry.number("intervalDamageTime", effect.intervalDamageTime);
            entry.bool("intervalDamagePierce", effect.intervalDamagePierce);
            entry.number("transitionDamage", effect.transitionDamage);

            entry.bool("disarm", effect.disarm);
            entry.bool("permanent", effect.permanent);
            entry.bool("reactive", effect.reactive);
            entry.bool("dynamic", effect.dynamic);
            entry.string("color", color(effect.color));

            statuses.raw(effect.name, entry.object());
        }

        out.raw("items", items.object());
        out.raw("liquids", liquids.object());
        out.raw("statuses", statuses.object());
        return out.object();
    }

    /** Цвет в вид «#rrggbb»: у arc toString отдаёт восемь знаков с прозрачностью. */
    static String color(arc.graphics.Color value){
        return "#" + value.toString().substring(0, 6);
    }

    static String kind(Block block){
        if(block instanceof OreBlock) return "ore";
        if(block instanceof OverlayFloor) return "overlay";
        if(block instanceof StaticWall) return "staticWall";
        if(block instanceof Prop || block instanceof TallBlock) return "prop";
        if(block instanceof Floor) return "floor";
        return null;
    }

    /**
     * Шесть базовых команд с их цветами. Цвет команды виден в мире: им красится «ячейка»
     * юнита поверх спрайта, и `sensor @color` отдаёт именно его.
     */
    static String teams(){
        Json out = new Json();
        out.string("gameVersion", VERSION);
        out.string("source", "game/Team.java через ContentDump");
        out.string("note", "Файл сгенерирован, править вручную нельзя.");

        Json teams = new Json();

        for(Team team : Team.baseTeams){
            Json entry = new Json();

            entry.number("id", team.id);
            entry.string("color", color(team.color));

            List<String> palette = new ArrayList<>();
            for(int i = 0; i < team.palette.length; i++){
                palette.add("\"" + color(team.palette[i]) + "\"");
            }
            entry.raw("palette", "[" + String.join(", ", palette) + "]");

            teams.raw(team.name, entry.object());
        }

        out.raw("teams", teams.object());
        return out.object();
    }

    static void write(Path path, String text) throws Exception{
        Files.createDirectories(path.toAbsolutePath().getParent());
        try(PrintWriter writer = new PrintWriter(Files.newBufferedWriter(path, StandardCharsets.UTF_8))){
            writer.print(text);
            writer.print("\n");
        }
    }

    /**
     * Сборка JSON руками: зависимостей у выгрузки нет, а порядок полей должен быть стабильным.
     * Печатается сплошной строкой — раскладывает её по строчкам уже `gen-dump.mjs`, тем же
     * `JSON.stringify`, что и остальные таблицы, чтобы формат везде был один.
     */
    static class Json{
        final List<String> fields = new ArrayList<>();

        void string(String name, String value){
            raw(name, "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"");
        }

        void strings(String name, List<String> values){
            List<String> quoted = new ArrayList<>();
            for(String value : values) quoted.add("\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"");
            raw(name, "[" + String.join(", ", quoted) + "]");
        }

        void bool(String name, boolean value){
            raw(name, value ? "true" : "false");
        }

        /** Целое печатается целым: `40`, а не `40.0` — иначе diff мигает на каждой сборке. */
        void number(String name, float value){
            if(Float.isNaN(value) || Float.isInfinite(value)) raw(name, "null");
            else if(value == Math.rint(value) && Math.abs(value) < 1e9) raw(name, String.valueOf((long)value));
            else raw(name, String.valueOf(value));
        }

        void number(String name, int value){
            raw(name, String.valueOf(value));
        }

        void raw(String name, String value){
            fields.add("\"" + name + "\": " + value);
        }

        String object(){
            return "{" + String.join(", ", fields) + "}";
        }
    }
}
