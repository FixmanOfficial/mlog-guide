import arc.Core;
import arc.Settings;
import arc.util.Log;

import mindustry.Vars;
import mindustry.core.ContentLoader;
import mindustry.type.ItemStack;
import mindustry.type.UnitType;
import mindustry.world.Block;
import mindustry.world.blocks.logic.LogicBlock;
import mindustry.world.blocks.logic.LogicDisplay;
import mindustry.world.blocks.logic.MemoryBlock;
import mindustry.world.blocks.logic.MessageBlock;
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
        if(args.length < 2){
            System.err.println("нужны два пути: <unit-specs.json> <block-specs.json>");
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
