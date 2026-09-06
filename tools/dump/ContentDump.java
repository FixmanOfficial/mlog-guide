import arc.Core;
import arc.Settings;
import arc.util.Log;

import mindustry.Vars;
import mindustry.core.ContentLoader;
import mindustry.game.Team;
import mindustry.gen.Crawlc;
import mindustry.gen.Legsc;
import mindustry.gen.Mechc;
import mindustry.gen.Tankc;
import mindustry.type.Item;
import mindustry.type.ItemStack;
import mindustry.type.Liquid;
import mindustry.type.UnitType;
import mindustry.content.Blocks;
import mindustry.world.Block;
import mindustry.world.blocks.defense.turrets.BaseTurret;
import mindustry.world.blocks.logic.LogicBlock;
import mindustry.world.blocks.logic.LogicDisplay;
import mindustry.world.blocks.logic.MemoryBlock;
import mindustry.world.blocks.logic.MessageBlock;
import mindustry.world.blocks.environment.Floor;
import mindustry.world.blocks.environment.OreBlock;
import mindustry.world.blocks.environment.OverlayFloor;
import mindustry.world.blocks.environment.Prop;
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
        if(args.length < 4){
            System.err.println("нужны четыре пути: <unit-specs.json> <block-specs.json> "
                + "<teams.json> <materials.json>");
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
            spec.bool("breakable", block.breakable);
            spec.bool("placeableOn", block.placeableOn);
            spec.bool("synthetic", block.synthetic());

            spec.number("itemCapacity", block.itemCapacity);
            spec.number("liquidCapacity", block.liquidCapacity);

            spec.string("category", block.category.name());
            spec.string("group", block.group.name());
            spec.string("buildVisibility", visibilityName(block.buildVisibility));
            spec.bool("canBeBuilt", block.canBeBuilt());

            // Логические блоки: то, ради чего эта таблица вообще появилась
            if(block instanceof LogicBlock logic){
                spec.number("ipt", logic.instructionsPerTick);
                spec.number("range", logic.range);
                spec.number("maxInstructionScale", logic.maxInstructionScale);
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

    /**
     * `BuildVisibility` — не enum, а класс со статическими экземплярами, и спросить у него имя
     * нельзя. Спрашивать `visible()` тем более: половина условий там смотрит в `Vars.state`,
     * которого без запущенной игры нет. Поэтому имя достаётся отражением по совпадению ссылки.
     */
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

        out.raw("items", items.object());
        out.raw("liquids", liquids.object());
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
