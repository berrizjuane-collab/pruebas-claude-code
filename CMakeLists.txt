cmake_minimum_required(VERSION 3.25)

project(OperationYggdrasil VERSION 1.0.0 LANGUAGES C CXX)

option(YGGDRASIL_BUILD_GUI "Build the raylib desktop game" ON)
option(YGGDRASIL_ENABLE_SANITIZERS "Enable AddressSanitizer and UndefinedBehaviorSanitizer" OFF)

set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin")
if(CMAKE_CONFIGURATION_TYPES)
    foreach(configuration IN LISTS CMAKE_CONFIGURATION_TYPES)
        string(TOUPPER "${configuration}" configuration_upper)
        set("CMAKE_RUNTIME_OUTPUT_DIRECTORY_${configuration_upper}" "${CMAKE_BINARY_DIR}/bin")
    endforeach()
endif()

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")
include(YggdrasilBuild)

add_custom_target(yggdrasil_runtime_data ALL
    COMMAND "${CMAKE_COMMAND}" -E make_directory "${CMAKE_RUNTIME_OUTPUT_DIRECTORY}"
    COMMAND "${CMAKE_COMMAND}" -E copy_directory
            "${CMAKE_CURRENT_SOURCE_DIR}/data"
            "${CMAKE_RUNTIME_OUTPUT_DIRECTORY}/data"
    COMMENT "Copying Yggdrasil catalogs beside the executables"
    VERBATIM
)

add_library(yggdrasil_core STATIC
    src/core/event.cpp
    src/core/catalog.cpp
    src/core/btree.cpp
    src/core/game_engine.cpp
    src/ai/ai_controller.cpp
)
add_library(yggdrasil::core ALIAS yggdrasil_core)
target_compile_features(yggdrasil_core PUBLIC cxx_std_20)
target_include_directories(yggdrasil_core
    PUBLIC
        "$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>"
)
yggdrasil_configure_target(yggdrasil_core)

add_executable(yggdrasil_sim tools/yggdrasil_sim.cpp)
target_link_libraries(yggdrasil_sim PRIVATE yggdrasil::core)
yggdrasil_configure_target(yggdrasil_sim)
add_dependencies(yggdrasil_sim yggdrasil_runtime_data)

if(YGGDRASIL_BUILD_GUI)
    include(FetchContent)

    set(BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
    set(BUILD_GAMES OFF CACHE BOOL "" FORCE)
    set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)

    FetchContent_Declare(raylib
        GIT_REPOSITORY https://github.com/raysan5/raylib.git
        GIT_TAG dbc56a87da87d973a9c5baa4e7438a9d20121d28
        GIT_SHALLOW FALSE
        GIT_PROGRESS TRUE
    )
    FetchContent_MakeAvailable(raylib)

    add_executable(yggdrasil_game
        src/main.cpp
        src/ui/game_app.cpp
    )
    target_link_libraries(yggdrasil_game PRIVATE yggdrasil::core raylib)
    yggdrasil_configure_target(yggdrasil_game)
    add_dependencies(yggdrasil_game yggdrasil_runtime_data)
endif()

include(CTest)
if(BUILD_TESTING)
    function(yggdrasil_add_test target source)
        add_executable("${target}" "${source}")
        target_link_libraries("${target}" PRIVATE yggdrasil::core)
        yggdrasil_configure_target("${target}")
        add_dependencies("${target}" yggdrasil_runtime_data)
        add_test(NAME "${target}" COMMAND "$<TARGET_FILE:${target}>")
        set_tests_properties("${target}" PROPERTIES
            WORKING_DIRECTORY "$<TARGET_FILE_DIR:${target}>"
        )
    endfunction()

    yggdrasil_add_test(test_btree tests/test_btree.cpp)
    yggdrasil_add_test(test_catalog tests/test_catalog.cpp)
    yggdrasil_add_test(test_ai tests/test_ai.cpp)
    yggdrasil_add_test(test_engine tests/test_engine.cpp)
    yggdrasil_add_test(test_combat tests/test_combat.cpp)
    yggdrasil_add_test(test_manual tests/test_manual.cpp)
    yggdrasil_add_test(test_simulation tests/test_simulation.cpp)
endif()
