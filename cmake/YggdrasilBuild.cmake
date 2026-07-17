include_guard(GLOBAL)

function(yggdrasil_configure_target target)
    if(MSVC)
        target_compile_options("${target}" PRIVATE /W4 /permissive- /EHsc)
    else()
        target_compile_options("${target}" PRIVATE
            -Wall
            -Wextra
            -Wpedantic
            -Wshadow
        )
    endif()

    if(YGGDRASIL_ENABLE_SANITIZERS)
        if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
            target_compile_options("${target}" PRIVATE
                -fsanitize=address,undefined
                -fno-omit-frame-pointer
            )
            target_link_options("${target}" PUBLIC
                -fsanitize=address,undefined
                -fno-omit-frame-pointer
            )
        else()
            message(WARNING
                "YGGDRASIL_ENABLE_SANITIZERS is ON, but ${CMAKE_CXX_COMPILER_ID} "
                "does not support this project's ASan/UBSan flags."
            )
        endif()
    endif()
endfunction()
