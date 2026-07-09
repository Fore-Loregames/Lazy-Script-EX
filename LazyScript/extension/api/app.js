'use strict';

const apiData = window.LSX_API_DATA || { entries: [], stats: { total: 0, modules: {}, kinds: {} }, manifest: {} };

const fullAppSource = `use "@LazyScript/bindings/GLFW/GLFW.lsx" as GLFW
use "@LazyScript/bindings/OpenGL/OpenGL46.lsx" as GL
use "@LazyScript/bindings/Platform/Win32.lsx" as Win32
use "@LazyScript/bindings/UI/LazyUI.lsx" as UI
use "@LazyScript/bindings/UI/Renderer.lsx" as UIRenderer

const AppProps = {
    title = "My First LazyUI App"
    status = "Ready"
    document = null
}

lscss .app = {
    width = "100vw"
    height = "100vh"
    padding = "24px"
    align_items = "center"
    justify_content = "center"
    background = "linear-gradient(135deg, #0d1521, #18263a)"
    color = "#edf4ff"
}

lscss .card = {
    width = "440px"
    padding = "22px"
    gap = "12px"
    background = "#172335"
    border = "1px #3b5272"
    border_radius = "14px"
    box_shadow = "0 18px 40px 0 rgba(0,0,0,0.35)"
}

lscss h2 = {
    font_size = "26px"
    color = "#ffffff"
}

lscss .message = {
    color = "#aebed3"
}

lscss button = {
    height = "40px"
    padding = "9px 15px"
    background = "linear-gradient(90deg, #3e83ed, #7258d8)"
    border = "1px #83aaf0"
    border_radius = "8px"
    color = "#ffffff"
    cursor = "pointer"
    hover = {
        background = "linear-gradient(90deg, #5597ff, #866ce8)"
    }
    active = {
        translate_y = "1px"
    }
}

lscss .status = {
    min_height = "30px"
    padding = "6px 9px"
    background = "#101a28"
    border = "1px #2d415c"
    border_radius = "7px"
    color = "#8fb9f5"
}

lshtml app_view(props) = {(
    <ui class="app">
        <panel class="card">
            <h2>{props.title}</h2>
            <span class="message">This window is rendered by native LazyUI.</span>
            <button onclick={hello_clicked} context={props}>Click Me</button>
            <statusbar id="status" class="status">{props.status}</statusbar>
        </panel>
    </ui>
)}

fn hello_clicked(element,event,props)
    props.status = "The button works. You are now updating retained UI."
    local status = props.document.find("#status")
    if status ~= null then status.set_text(props.status) end
    return 0
end

fn fail(message)
    Win32.MessageBoxA(0,message,"LazyUI",Win32.MB_OK+Win32.MB_ICONERROR)
    return 1
end

fn main()
    if GLFW.lsxLoadLibraries() < 1 or GLFW.glfwInit() == 0 then
        return fail("GLFW initialization failed.")
    end

    GLFW.glfwWindowHint(GLFW.GLFW_CONTEXT_VERSION_MAJOR,4)
    GLFW.glfwWindowHint(GLFW.GLFW_CONTEXT_VERSION_MINOR,6)
    GLFW.glfwWindowHint(GLFW.GLFW_OPENGL_PROFILE,GLFW.GLFW_OPENGL_CORE_PROFILE)

    local window = GLFW.glfwCreateWindow(900,600,"My First LazyUI App",0,0)
    if window == 0 then return fail("Window creation failed.") end

    GLFW.glfwMakeContextCurrent(window)
    GLFW.glfwSwapInterval(1)
    if GL.lsxLoadOpenGL() < 1 then return fail("OpenGL loading failed.") end

    local props = AppProps.new()
    local root = app_view(props)
    local document = UI.document(root)
    props.document = document
    local renderer = UIRenderer.create(null,64)
    local window_input = UI.connect_window_input(window,document)
    local framebuffer = GLFW.FramebufferSize.new()
    local window_size = GLFW.WindowSize.new()
    local cursor = GLFW.CursorPosition.new()
    local mouse_down = false

    while GLFW.glfwWindowShouldClose(window) == 0 do
        framebuffer.refresh(window)
        window_size.refresh(window)
        cursor.refresh(window)

        document.resize(framebuffer.width,framebuffer.height)
        document.pointer_move_scaled(
            cursor.x,
            cursor.y,
            window_size.width,
            window_size.height
        )

        local pressed = GLFW.glfwGetMouseButton(
            window,
            GLFW.GLFW_MOUSE_BUTTON_LEFT
        ) == GLFW.GLFW_PRESS

        if pressed and not mouse_down then
            document.pointer_down_button(GLFW.GLFW_MOUSE_BUTTON_LEFT)
        end
        if not pressed and mouse_down then
            document.pointer_up_button(GLFW.GLFW_MOUSE_BUTTON_LEFT)
        end
        mouse_down = pressed

        GL.glViewport(0,0,framebuffer.width,framebuffer.height)
        GL.glClearColor(0.03,0.05,0.08,1.0)
        GL.glClear(GL.GL_COLOR_BUFFER_BIT)

        renderer.begin(framebuffer.width,framebuffer.height)
        renderer.submit(root)
        renderer.flush()

        GLFW.glfwSwapBuffers(window)
        GLFW.glfwPollEvents()
    end

    window_input.destroy()
    cursor.destroy()
    window_size.destroy()
    framebuffer.destroy()
    document.destroy()
    props.destroy()
    renderer.destroy()
    GLFW.glfwDestroyWindow(window)
    GLFW.glfwTerminate()
    GLFW.lsxUnloadLibraries()
    return 0
end`;

const welcomeCompleteSource = `use "@LazyScript/bindings/GLFW/GLFW.lsx" as GLFW
use "@LazyScript/bindings/OpenGL/OpenGL46.lsx" as GL
use "@LazyScript/bindings/Platform/Win32.lsx" as Win32
use "@LazyScript/bindings/UI/LazyUI.lsx" as UI
use "@LazyScript/bindings/UI/Renderer.lsx" as UIRenderer

const WelcomeProps = {
    title = "Build Something New"
    message = "LazyUI keeps familiar markup while compiling to native code."
    document = null
}

lscss .screen = {
    width = "100vw"
    height = "100vh"
    align_items = "center"
    justify_content = "center"
    background = "linear-gradient(135deg, #0d1521, #18263a)"
    color = "#edf4ff"
}

lscss .welcome-card = {
    width = "420px"
    padding = "22px"
    gap = "11px"
    background = "#172335"
    border = "1px #3b5272"
    border_radius = "14px"
    box_shadow = "0 18px 40px 0 rgba(0,0,0,0.35)"
}

lscss .eyebrow = {
    color = "#79aef8"
    font_size = "11px"
}

lscss .message = {
    color = "#aebed3"
}

lscss .primary = {
    height = "40px"
    padding = "9px 15px"
    background = "linear-gradient(90deg, #3e83ed, #7258d8)"
    border = "1px #83aaf0"
    border_radius = "8px"
    color = "#ffffff"
    cursor = "pointer"
    hover = {
        background = "linear-gradient(90deg, #5597ff, #866ce8)"
    }
    active = {
        translate_y = "1px"
    }
}

lscss .status = {
    min_height = "30px"
    padding = "6px 9px"
    background = "#101a28"
    border = "1px #2d415c"
    border_radius = "7px"
    color = "#8fb9f5"
}

lshtml welcome_view(props) = {(
    <ui class="screen">
        <panel class="welcome-card">
            <badge class="eyebrow">WELCOME</badge>
            <h2>{props.title}</h2>
            <span class="message">{props.message}</span>
            <button class="primary" onclick={create_clicked} context={props}>
                Create Project
            </button>
            <statusbar id="welcome-status" class="status">
                Ready to begin.
            </statusbar>
        </panel>
    </ui>
)}

fn create_clicked(element,event,props)
    local status = props.document.find("#welcome-status")
    if status ~= null then
        status.set_text("Project creation started.")
    end
    return 0
end

fn fail(message)
    Win32.MessageBoxA(0,message,"LazyUI",Win32.MB_OK+Win32.MB_ICONERROR)
    return 1
end

fn run_window(root,title,width,height,props)
    if GLFW.lsxLoadLibraries() < 1 or GLFW.glfwInit() == 0 then
        return fail("GLFW initialization failed.")
    end

    GLFW.glfwWindowHint(GLFW.GLFW_CONTEXT_VERSION_MAJOR,4)
    GLFW.glfwWindowHint(GLFW.GLFW_CONTEXT_VERSION_MINOR,6)
    GLFW.glfwWindowHint(GLFW.GLFW_OPENGL_PROFILE,GLFW.GLFW_OPENGL_CORE_PROFILE)

    local window = GLFW.glfwCreateWindow(width,height,title,0,0)
    if window == 0 then
        GLFW.glfwTerminate()
        GLFW.lsxUnloadLibraries()
        return fail("Window creation failed.")
    end

    GLFW.glfwMakeContextCurrent(window)
    GLFW.glfwSwapInterval(1)
    if GL.lsxLoadOpenGL() < 1 then
        GLFW.glfwDestroyWindow(window)
        GLFW.glfwTerminate()
        GLFW.lsxUnloadLibraries()
        return fail("OpenGL loading failed.")
    end

    local document = UI.document(root)
    props.document = document
    local renderer = UIRenderer.create(null,64)
    if not renderer.ready then
        document.destroy()
        renderer.destroy()
        GLFW.glfwDestroyWindow(window)
        GLFW.glfwTerminate()
        GLFW.lsxUnloadLibraries()
        return fail("LazyUI renderer initialization failed.")
    end

    local window_input = UI.connect_window_input(window,document)
    local framebuffer = GLFW.FramebufferSize.new()
    local window_size = GLFW.WindowSize.new()
    local cursor = GLFW.CursorPosition.new()
    local mouse_down = false

    while GLFW.glfwWindowShouldClose(window) == 0 do
        framebuffer.refresh(window)
        window_size.refresh(window)
        cursor.refresh(window)

        document.resize(framebuffer.width,framebuffer.height)
        document.pointer_move_scaled(
            cursor.x,
            cursor.y,
            window_size.width,
            window_size.height
        )

        local pressed = GLFW.glfwGetMouseButton(
            window,
            GLFW.GLFW_MOUSE_BUTTON_LEFT
        ) == GLFW.GLFW_PRESS

        if pressed and not mouse_down then
            document.pointer_down_button(GLFW.GLFW_MOUSE_BUTTON_LEFT)
        end
        if not pressed and mouse_down then
            document.pointer_up_button(GLFW.GLFW_MOUSE_BUTTON_LEFT)
        end
        mouse_down = pressed

        GL.glViewport(0,0,framebuffer.width,framebuffer.height)
        GL.glClearColor(0.03,0.05,0.08,1.0)
        GL.glClear(GL.GL_COLOR_BUFFER_BIT)

        renderer.begin(framebuffer.width,framebuffer.height)
        renderer.submit(root)
        renderer.flush()

        GLFW.glfwSwapBuffers(window)
        GLFW.glfwPollEvents()
    end

    window_input.destroy()
    cursor.destroy()
    window_size.destroy()
    framebuffer.destroy()
    document.destroy()
    renderer.destroy()
    GLFW.glfwDestroyWindow(window)
    GLFW.glfwTerminate()
    GLFW.lsxUnloadLibraries()
    return 0
end

fn main()
    local props = WelcomeProps.new()
    local root = welcome_view(props)
    local result = run_window(root,"Welcome Panel",900,600,props)
    props.destroy()
    return result
end`;

const counterCompleteSource = `use "@LazyScript/bindings/GLFW/GLFW.lsx" as GLFW
use "@LazyScript/bindings/OpenGL/OpenGL46.lsx" as GL
use "@LazyScript/bindings/Platform/Win32.lsx" as Win32
use "@LazyScript/bindings/UI/LazyUI.lsx" as UI
use "@LazyScript/bindings/UI/Renderer.lsx" as UIRenderer

const CounterProps = {
    count = 0
    text = null
    document = null
}

lscss .screen = {
    width = "100vw"
    height = "100vh"
    align_items = "center"
    justify_content = "center"
    background = "linear-gradient(135deg, #0d1521, #18263a)"
    color = "#edf4ff"
}

lscss .counter-card = {
    width = "330px"
    padding = "18px"
    gap = "12px"
    background = "#172335"
    border = "1px #3b5272"
    border_radius = "12px"
}

lscss .counter-row = {
    flex_direction = "row"
    align_items = "center"
    justify_content = "center"
    gap = "14px"
    padding = "14px"
    background = "#101a28"
    border_radius = "9px"
}

lscss .counter-button = {
    width = "48px"
    height = "42px"
    background = "#263b58"
    border = "1px #4f7099"
    border_radius = "8px"
    color = "#ffffff"
    font_size = "22px"
    cursor = "pointer"
    hover = {
        background = "#315078"
    }
}

lscss .count-value = {
    width = "64px"
    color = "#9fc4ff"
    font_size = "30px"
    text_align = "center"
}

lscss .hint = {
    color = "#93a6bc"
    text_align = "center"
}

lshtml counter_view(props) = {(
    <ui class="screen">
        <panel class="counter-card">
            <h3>Party Size</h3>
            <row class="counter-row">
                <button class="counter-button" number-value=-1
                    onclick={change_count} context={props}>-</button>
                <span id="count-value" class="count-value">0</span>
                <button class="counter-button" number-value=1
                    onclick={change_count} context={props}>+</button>
            </row>
            <span class="hint">Choose between 0 and 8 party members.</span>
        </panel>
    </ui>
)}

fn change_count(element,event,props)
    props.count = props.count + element.number_value
    if props.count < 0 then props.count = 0 end
    if props.count > 8 then props.count = 8 end

    local value = props.document.find("#count-value")
    if value ~= null then
        value.set_text(props.text.set_i64(props.count))
    end
    return 0
end

fn fail(message)
    Win32.MessageBoxA(0,message,"LazyUI",Win32.MB_OK+Win32.MB_ICONERROR)
    return 1
end

fn run_window(root,title,width,height,props)
    if GLFW.lsxLoadLibraries() < 1 or GLFW.glfwInit() == 0 then
        return fail("GLFW initialization failed.")
    end

    GLFW.glfwWindowHint(GLFW.GLFW_CONTEXT_VERSION_MAJOR,4)
    GLFW.glfwWindowHint(GLFW.GLFW_CONTEXT_VERSION_MINOR,6)
    GLFW.glfwWindowHint(GLFW.GLFW_OPENGL_PROFILE,GLFW.GLFW_OPENGL_CORE_PROFILE)

    local window = GLFW.glfwCreateWindow(width,height,title,0,0)
    if window == 0 then
        GLFW.glfwTerminate()
        GLFW.lsxUnloadLibraries()
        return fail("Window creation failed.")
    end

    GLFW.glfwMakeContextCurrent(window)
    GLFW.glfwSwapInterval(1)
    if GL.lsxLoadOpenGL() < 1 then
        GLFW.glfwDestroyWindow(window)
        GLFW.glfwTerminate()
        GLFW.lsxUnloadLibraries()
        return fail("OpenGL loading failed.")
    end

    local document = UI.document(root)
    props.document = document
    local renderer = UIRenderer.create(null,64)
    if not renderer.ready then
        document.destroy()
        renderer.destroy()
        GLFW.glfwDestroyWindow(window)
        GLFW.glfwTerminate()
        GLFW.lsxUnloadLibraries()
        return fail("LazyUI renderer initialization failed.")
    end

    local window_input = UI.connect_window_input(window,document)
    local framebuffer = GLFW.FramebufferSize.new()
    local window_size = GLFW.WindowSize.new()
    local cursor = GLFW.CursorPosition.new()
    local mouse_down = false

    while GLFW.glfwWindowShouldClose(window) == 0 do
        framebuffer.refresh(window)
        window_size.refresh(window)
        cursor.refresh(window)

        document.resize(framebuffer.width,framebuffer.height)
        document.pointer_move_scaled(
            cursor.x,
            cursor.y,
            window_size.width,
            window_size.height
        )

        local pressed = GLFW.glfwGetMouseButton(
            window,
            GLFW.GLFW_MOUSE_BUTTON_LEFT
        ) == GLFW.GLFW_PRESS

        if pressed and not mouse_down then
            document.pointer_down_button(GLFW.GLFW_MOUSE_BUTTON_LEFT)
        end
        if not pressed and mouse_down then
            document.pointer_up_button(GLFW.GLFW_MOUSE_BUTTON_LEFT)
        end
        mouse_down = pressed

        GL.glViewport(0,0,framebuffer.width,framebuffer.height)
        GL.glClearColor(0.03,0.05,0.08,1.0)
        GL.glClear(GL.GL_COLOR_BUFFER_BIT)

        renderer.begin(framebuffer.width,framebuffer.height)
        renderer.submit(root)
        renderer.flush()

        GLFW.glfwSwapBuffers(window)
        GLFW.glfwPollEvents()
    end

    window_input.destroy()
    cursor.destroy()
    window_size.destroy()
    framebuffer.destroy()
    document.destroy()
    renderer.destroy()
    GLFW.glfwDestroyWindow(window)
    GLFW.glfwTerminate()
    GLFW.lsxUnloadLibraries()
    return 0
end

fn main()
    local props = CounterProps.new()
    props.text = UI.counter_text("",32)
    local root = counter_view(props)
    local result = run_window(root,"Counter Example",760,520,props)
    props.text.destroy()
    props.destroy()
    return result
end`;

const formCompleteSource = `use "@LazyScript/bindings/GLFW/GLFW.lsx" as GLFW
use "@LazyScript/bindings/OpenGL/OpenGL46.lsx" as GL
use "@LazyScript/bindings/Platform/Win32.lsx" as Win32
use "@LazyScript/bindings/UI/LazyUI.lsx" as UI
use "@LazyScript/bindings/UI/Renderer.lsx" as UIRenderer

const FormProps = {
    name = ""
    notes = ""
    document = null
}

lscss .screen = {
    width = "100vw"
    height = "100vh"
    align_items = "center"
    justify_content = "center"
    background = "linear-gradient(135deg, #0d1521, #18263a)"
    color = "#edf4ff"
}

lscss .profile-form = {
    width = "430px"
    padding = "20px"
    gap = "9px"
    background = "#162131"
    border = "1px #334a67"
    border_radius = "12px"
}

lscss label = {
    color = "#aebed3"
}

lscss input, textarea = {
    width = "100%"
    padding = "9px 10px"
    background = "#0f1722"
    border = "1px #324762"
    border_radius = "7px"
    color = "#ffffff"
    focus = {
        border = "1px #75a7ee"
        outline = "2px rgba(117,167,238,0.20)"
    }
}

lscss textarea = {
    height = "100px"
    overflow_y = "auto"
}

lscss .form-status = {
    min_height = "30px"
    padding = "6px 9px"
    background = "#101a28"
    color = "#8fb9f5"
    border_radius = "7px"
}

lshtml profile_view(props) = {(
    <ui class="screen">
        <panel class="profile-form">
            <h3>Character Profile</h3>

            <label>Name</label>
            <input
                placeholder="Character name"
                maxlength=32
                oninput={name_changed}
                context={props}
            />

            <label>Notes</label>
            <textarea
                placeholder="Write a short note..."
                maxlength=300
                oninput={notes_changed}
                context={props}
            />

            <statusbar id="form-status" class="form-status">
                Start typing to update this message.
            </statusbar>
        </panel>
    </ui>
)}

fn name_changed(element,event,props)
    if element.value == null then props.name = ""
    else props.name = element.value end

    local status = props.document.find("#form-status")
    if status ~= null then
        if string.length(props.name) == 0 then
            status.set_text("Enter a character name.")
        else
            status.set_text(props.name)
        end
    end
    return 0
end

fn notes_changed(element,event,props)
    if element.value == null then props.notes = ""
    else props.notes = element.value end

    local status = props.document.find("#form-status")
    if status ~= null then
        if string.length(props.notes) == 0 then
            status.set_text("Write a short note.")
        else
            status.set_text("Notes updated.")
        end
    end
    return 0
end

fn fail(message)
    Win32.MessageBoxA(0,message,"LazyUI",Win32.MB_OK+Win32.MB_ICONERROR)
    return 1
end

fn run_window(root,title,width,height,props)
    if GLFW.lsxLoadLibraries() < 1 or GLFW.glfwInit() == 0 then
        return fail("GLFW initialization failed.")
    end

    GLFW.glfwWindowHint(GLFW.GLFW_CONTEXT_VERSION_MAJOR,4)
    GLFW.glfwWindowHint(GLFW.GLFW_CONTEXT_VERSION_MINOR,6)
    GLFW.glfwWindowHint(GLFW.GLFW_OPENGL_PROFILE,GLFW.GLFW_OPENGL_CORE_PROFILE)

    local window = GLFW.glfwCreateWindow(width,height,title,0,0)
    if window == 0 then
        GLFW.glfwTerminate()
        GLFW.lsxUnloadLibraries()
        return fail("Window creation failed.")
    end

    GLFW.glfwMakeContextCurrent(window)
    GLFW.glfwSwapInterval(1)
    if GL.lsxLoadOpenGL() < 1 then
        GLFW.glfwDestroyWindow(window)
        GLFW.glfwTerminate()
        GLFW.lsxUnloadLibraries()
        return fail("OpenGL loading failed.")
    end

    local document = UI.document(root)
    props.document = document
    local renderer = UIRenderer.create(null,64)
    if not renderer.ready then
        document.destroy()
        renderer.destroy()
        GLFW.glfwDestroyWindow(window)
        GLFW.glfwTerminate()
        GLFW.lsxUnloadLibraries()
        return fail("LazyUI renderer initialization failed.")
    end

    local window_input = UI.connect_window_input(window,document)
    local framebuffer = GLFW.FramebufferSize.new()
    local window_size = GLFW.WindowSize.new()
    local cursor = GLFW.CursorPosition.new()
    local mouse_down = false

    while GLFW.glfwWindowShouldClose(window) == 0 do
        framebuffer.refresh(window)
        window_size.refresh(window)
        cursor.refresh(window)

        document.resize(framebuffer.width,framebuffer.height)
        document.pointer_move_scaled(
            cursor.x,
            cursor.y,
            window_size.width,
            window_size.height
        )

        local pressed = GLFW.glfwGetMouseButton(
            window,
            GLFW.GLFW_MOUSE_BUTTON_LEFT
        ) == GLFW.GLFW_PRESS

        if pressed and not mouse_down then
            document.pointer_down_button(GLFW.GLFW_MOUSE_BUTTON_LEFT)
        end
        if not pressed and mouse_down then
            document.pointer_up_button(GLFW.GLFW_MOUSE_BUTTON_LEFT)
        end
        mouse_down = pressed

        GL.glViewport(0,0,framebuffer.width,framebuffer.height)
        GL.glClearColor(0.03,0.05,0.08,1.0)
        GL.glClear(GL.GL_COLOR_BUFFER_BIT)

        renderer.begin(framebuffer.width,framebuffer.height)
        renderer.submit(root)
        renderer.flush()

        GLFW.glfwSwapBuffers(window)
        GLFW.glfwPollEvents()
    end

    window_input.destroy()
    cursor.destroy()
    window_size.destroy()
    framebuffer.destroy()
    document.destroy()
    renderer.destroy()
    GLFW.glfwDestroyWindow(window)
    GLFW.glfwTerminate()
    GLFW.lsxUnloadLibraries()
    return 0
end

fn main()
    local props = FormProps.new()
    local root = profile_view(props)
    local result = run_window(root,"Character Profile",820,620,props)
    props.destroy()
    return result
end`;

const scrollingCompleteSource = `use "@LazyScript/bindings/GLFW/GLFW.lsx" as GLFW
use "@LazyScript/bindings/OpenGL/OpenGL46.lsx" as GL
use "@LazyScript/bindings/Platform/Win32.lsx" as Win32
use "@LazyScript/bindings/UI/LazyUI.lsx" as UI
use "@LazyScript/bindings/UI/Renderer.lsx" as UIRenderer

lscss .screen = {
    width = "100vw"
    height = "100vh"
    align_items = "center"
    justify_content = "center"
    background = "linear-gradient(135deg, #0d1521, #18263a)"
    color = "#edf4ff"
}

lscss .inventory-card = {
    width = "430px"
    padding = "16px"
    gap = "10px"
    background = "#162131"
    border = "1px #344b69"
    border_radius = "12px"
}

lscss .inventory-title = {
    height = "32px"
    flex_direction = "row"
    align_items = "center"
}

lscss .inventory-scroll = {
    height = "260px"
    min_height = "260px"
    max_height = "260px"
    flex_shrink = 0
    gap = "6px"
    padding = "4px 14px 4px 4px"
    overflow_x = "hidden"
    overflow_y = "auto"
}

lscss .inventory-item = {
    width = "100%"
    min_height = "46px"
    flex_shrink = 0
    padding = "9px 11px"
    background = "#111b29"
    border = "1px #2c405a"
    border_radius = "8px"
    color = "#e8f0fb"
    text_align = "left"
    cursor = "pointer"
    hover = {
        background = "#1b2a3e"
        border = "1px #49698f"
    }
}

lshtml inventory_view = {(
    <ui class="screen">
        <panel class="inventory-card">
            <row class="inventory-title">
                <h3>Inventory</h3>
                <spacer />
                <badge>12 items</badge>
            </row>

            <column class="inventory-scroll">
                <button class="inventory-item">Iron Sword</button>
                <button class="inventory-item">Leather Armor</button>
                <button class="inventory-item">Health Potion</button>
                <button class="inventory-item">Mana Potion</button>
                <button class="inventory-item">Old Map</button>
                <button class="inventory-item">Torch</button>
                <button class="inventory-item">Rope</button>
                <button class="inventory-item">Silver Key</button>
                <button class="inventory-item">Cooked Fish</button>
                <button class="inventory-item">Blue Crystal</button>
                <button class="inventory-item">Travel Cloak</button>
                <button class="inventory-item">Quest Letter</button>
            </column>
        </panel>
    </ui>
)}

fn fail(message)
    Win32.MessageBoxA(0,message,"LazyUI",Win32.MB_OK+Win32.MB_ICONERROR)
    return 1
end

fn run_window(root,title,width,height)
    if GLFW.lsxLoadLibraries() < 1 or GLFW.glfwInit() == 0 then
        return fail("GLFW initialization failed.")
    end

    GLFW.glfwWindowHint(GLFW.GLFW_CONTEXT_VERSION_MAJOR,4)
    GLFW.glfwWindowHint(GLFW.GLFW_CONTEXT_VERSION_MINOR,6)
    GLFW.glfwWindowHint(GLFW.GLFW_OPENGL_PROFILE,GLFW.GLFW_OPENGL_CORE_PROFILE)

    local window = GLFW.glfwCreateWindow(width,height,title,0,0)
    if window == 0 then
        GLFW.glfwTerminate()
        GLFW.lsxUnloadLibraries()
        return fail("Window creation failed.")
    end

    GLFW.glfwMakeContextCurrent(window)
    GLFW.glfwSwapInterval(1)
    if GL.lsxLoadOpenGL() < 1 then
        GLFW.glfwDestroyWindow(window)
        GLFW.glfwTerminate()
        GLFW.lsxUnloadLibraries()
        return fail("OpenGL loading failed.")
    end

    local document = UI.document(root)
    local renderer = UIRenderer.create(null,64)
    if not renderer.ready then
        document.destroy()
        renderer.destroy()
        GLFW.glfwDestroyWindow(window)
        GLFW.glfwTerminate()
        GLFW.lsxUnloadLibraries()
        return fail("LazyUI renderer initialization failed.")
    end

    local window_input = UI.connect_window_input(window,document)
    local framebuffer = GLFW.FramebufferSize.new()
    local window_size = GLFW.WindowSize.new()
    local cursor = GLFW.CursorPosition.new()
    local mouse_down = false

    while GLFW.glfwWindowShouldClose(window) == 0 do
        framebuffer.refresh(window)
        window_size.refresh(window)
        cursor.refresh(window)

        document.resize(framebuffer.width,framebuffer.height)
        document.pointer_move_scaled(
            cursor.x,
            cursor.y,
            window_size.width,
            window_size.height
        )

        local pressed = GLFW.glfwGetMouseButton(
            window,
            GLFW.GLFW_MOUSE_BUTTON_LEFT
        ) == GLFW.GLFW_PRESS

        if pressed and not mouse_down then
            document.pointer_down_button(GLFW.GLFW_MOUSE_BUTTON_LEFT)
        end
        if not pressed and mouse_down then
            document.pointer_up_button(GLFW.GLFW_MOUSE_BUTTON_LEFT)
        end
        mouse_down = pressed

        GL.glViewport(0,0,framebuffer.width,framebuffer.height)
        GL.glClearColor(0.03,0.05,0.08,1.0)
        GL.glClear(GL.GL_COLOR_BUFFER_BIT)

        renderer.begin(framebuffer.width,framebuffer.height)
        renderer.submit(root)
        renderer.flush()

        GLFW.glfwSwapBuffers(window)
        GLFW.glfwPollEvents()
    end

    window_input.destroy()
    cursor.destroy()
    window_size.destroy()
    framebuffer.destroy()
    document.destroy()
    renderer.destroy()
    GLFW.glfwDestroyWindow(window)
    GLFW.glfwTerminate()
    GLFW.lsxUnloadLibraries()
    return 0
end

fn main()
    local root = inventory_view()
    return run_window(root,"Scrollable Inventory",820,620)
end`;

const tabsCompleteSource = `use "@LazyScript/bindings/GLFW/GLFW.lsx" as GLFW
use "@LazyScript/bindings/OpenGL/OpenGL46.lsx" as GL
use "@LazyScript/bindings/Platform/Win32.lsx" as Win32
use "@LazyScript/bindings/UI/LazyUI.lsx" as UI
use "@LazyScript/bindings/UI/Renderer.lsx" as UIRenderer

const SettingsProps = {
    active_tab = "graphics"
    document = null
}

lscss .screen = {
    width = "100vw"
    height = "100vh"
    align_items = "center"
    justify_content = "center"
    background = "linear-gradient(135deg, #0d1521, #18263a)"
    color = "#edf4ff"
}

lscss .settings-card = {
    width = "460px"
    background = "#151f2d"
    border = "1px #364c68"
    border_radius = "12px"
    overflow = "hidden"
}

lscss .tabs = {
    height = "48px"
    flex_direction = "row"
    gap = "4px"
    padding = "8px 8px 0px 8px"
    background = "#111a27"
    border_bottom = "1px #2b3d56"
}

lscss .tab = {
    padding = "9px 12px"
    background = "rgba(0,0,0,0)"
    border_radius = "7px 7px 0px 0px"
    color = "#8fa0b6"
    cursor = "pointer"
}

lscss .tab.active = {
    background = "#22344d"
    color = "#ffffff"
}

lscss .tab-page = {
    min_height = "220px"
    padding = "20px"
    gap = "10px"
}

lshtml settings_view(props) = {(
    <ui class="screen">
        <panel class="settings-card">
            <row class="tabs">
                <button id="graphics-tab" class="tab active" value="graphics"
                    onclick={open_tab} context={props}>Graphics</button>
                <button id="audio-tab" class="tab" value="audio"
                    onclick={open_tab} context={props}>Audio</button>
                <button id="gameplay-tab" class="tab" value="gameplay"
                    onclick={open_tab} context={props}>Gameplay</button>
            </row>

            <column id="graphics-page" class="tab-page">
                <h3>Graphics</h3>
                <checkbox checked>Bloom</checkbox>
                <checkbox checked>Ambient Occlusion</checkbox>
            </column>

            <column id="audio-page" class="tab-page" hidden>
                <h3>Audio</h3>
                <range min=0 max=100 step=1 number-value=72 />
                <checkbox checked>Spatial Audio</checkbox>
            </column>

            <column id="gameplay-page" class="tab-page" hidden>
                <h3>Gameplay</h3>
                <checkbox checked>Show Tutorials</checkbox>
                <checkbox>Auto Save</checkbox>
            </column>
        </panel>
    </ui>
)}

fn set_tab(document,button_selector,page_selector,is_active)
    local button = document.find(button_selector)
    local page = document.find(page_selector)

    if button ~= null then
        if is_active then button.add_class("active")
        else button.remove_class("active") end
    end

    if page ~= null then
        page.hidden = not is_active
    end
end

fn open_tab(element,event,props)
    props.active_tab = element.value

    set_tab(props.document,"#graphics-tab","#graphics-page",props.active_tab == "graphics")
    set_tab(props.document,"#audio-tab","#audio-page",props.active_tab == "audio")
    set_tab(props.document,"#gameplay-tab","#gameplay-page",props.active_tab == "gameplay")
    return 0
end

fn fail(message)
    Win32.MessageBoxA(0,message,"LazyUI",Win32.MB_OK+Win32.MB_ICONERROR)
    return 1
end

fn run_window(root,title,width,height,props)
    if GLFW.lsxLoadLibraries() < 1 or GLFW.glfwInit() == 0 then
        return fail("GLFW initialization failed.")
    end

    GLFW.glfwWindowHint(GLFW.GLFW_CONTEXT_VERSION_MAJOR,4)
    GLFW.glfwWindowHint(GLFW.GLFW_CONTEXT_VERSION_MINOR,6)
    GLFW.glfwWindowHint(GLFW.GLFW_OPENGL_PROFILE,GLFW.GLFW_OPENGL_CORE_PROFILE)

    local window = GLFW.glfwCreateWindow(width,height,title,0,0)
    if window == 0 then
        GLFW.glfwTerminate()
        GLFW.lsxUnloadLibraries()
        return fail("Window creation failed.")
    end

    GLFW.glfwMakeContextCurrent(window)
    GLFW.glfwSwapInterval(1)
    if GL.lsxLoadOpenGL() < 1 then
        GLFW.glfwDestroyWindow(window)
        GLFW.glfwTerminate()
        GLFW.lsxUnloadLibraries()
        return fail("OpenGL loading failed.")
    end

    local document = UI.document(root)
    props.document = document
    local renderer = UIRenderer.create(null,64)
    if not renderer.ready then
        document.destroy()
        renderer.destroy()
        GLFW.glfwDestroyWindow(window)
        GLFW.glfwTerminate()
        GLFW.lsxUnloadLibraries()
        return fail("LazyUI renderer initialization failed.")
    end

    local window_input = UI.connect_window_input(window,document)
    local framebuffer = GLFW.FramebufferSize.new()
    local window_size = GLFW.WindowSize.new()
    local cursor = GLFW.CursorPosition.new()
    local mouse_down = false

    while GLFW.glfwWindowShouldClose(window) == 0 do
        framebuffer.refresh(window)
        window_size.refresh(window)
        cursor.refresh(window)

        document.resize(framebuffer.width,framebuffer.height)
        document.pointer_move_scaled(
            cursor.x,
            cursor.y,
            window_size.width,
            window_size.height
        )

        local pressed = GLFW.glfwGetMouseButton(
            window,
            GLFW.GLFW_MOUSE_BUTTON_LEFT
        ) == GLFW.GLFW_PRESS

        if pressed and not mouse_down then
            document.pointer_down_button(GLFW.GLFW_MOUSE_BUTTON_LEFT)
        end
        if not pressed and mouse_down then
            document.pointer_up_button(GLFW.GLFW_MOUSE_BUTTON_LEFT)
        end
        mouse_down = pressed

        GL.glViewport(0,0,framebuffer.width,framebuffer.height)
        GL.glClearColor(0.03,0.05,0.08,1.0)
        GL.glClear(GL.GL_COLOR_BUFFER_BIT)

        renderer.begin(framebuffer.width,framebuffer.height)
        renderer.submit(root)
        renderer.flush()

        GLFW.glfwSwapBuffers(window)
        GLFW.glfwPollEvents()
    end

    window_input.destroy()
    cursor.destroy()
    window_size.destroy()
    framebuffer.destroy()
    document.destroy()
    renderer.destroy()
    GLFW.glfwDestroyWindow(window)
    GLFW.glfwTerminate()
    GLFW.lsxUnloadLibraries()
    return 0
end

fn main()
    local props = SettingsProps.new()
    local root = settings_view(props)
    local result = run_window(root,"Settings Tabs",860,620,props)
    props.destroy()
    return result
end`;

const hudCompleteSource = `use "@LazyScript/bindings/GLFW/GLFW.lsx" as GLFW
use "@LazyScript/bindings/OpenGL/OpenGL46.lsx" as GL
use "@LazyScript/bindings/Platform/Win32.lsx" as Win32
use "@LazyScript/bindings/UI/LazyUI.lsx" as UI
use "@LazyScript/bindings/UI/Renderer.lsx" as UIRenderer

lscss .screen = {
    width = "100vw"
    height = "100vh"
    position = "relative"
    background = "linear-gradient(180deg, #22384d, #101821)"
    color = "#edf4ff"
}

lscss .world = {
    position = "absolute"
    left = "0px"
    top = "0px"
    width = "100vw"
    height = "100vh"
}

lscss .health-panel = {
    position = "absolute"
    left = "16px"
    top = "16px"
    width = "210px"
    padding = "10px"
    gap = "6px"
    background = "rgba(8,13,20,0.86)"
    border = "1px #3b506d"
    border_radius = "9px"
}

lscss .health-bar = {
    height = "12px"
    background = "#2c1720"
    border_radius = "6px"
    overflow = "hidden"
}

lscss .health-fill = {
    width = "74%"
    height = "100%"
    background = "linear-gradient(90deg, #c74354, #f17b75)"
}

lscss .quest-panel = {
    position = "absolute"
    right = "16px"
    top = "16px"
    width = "250px"
    padding = "11px"
    gap = "6px"
    background = "rgba(8,13,20,0.86)"
    border = "1px #3b506d"
    border_radius = "9px"
}

lscss .hotbar = {
    position = "absolute"
    left = "50%"
    bottom = "14px"
    translate_x = "-50%"
    flex_direction = "row"
    gap = "5px"
}

lscss inventory-slot = {
    width = "78px"
    height = "54px"
    align_items = "center"
    justify_content = "center"
    background = "rgba(8,13,20,0.86)"
    border = "1px #3b506d"
    border_radius = "7px"
}

lscss inventory-slot.selected = {
    border = "2px #8ebcff"
    background = "rgba(34,60,91,0.94)"
}

lshtml hud_view = {(
    <ui class="screen">
        <canvas class="world">
            <circle cx=250 cy=210 r=110 fill="#3e6d45" />
            <ellipse cx=660 cy=310 rx=290 ry=115 fill="#285279" />
            <polygon points="0,520 300,330 580,510 920,260 1280,520"
                fill="#263f32" />
        </canvas>

        <panel class="health-panel">
            <row>
                <span>Health</span>
                <spacer />
                <span>74 / 100</span>
            </row>
            <panel class="health-bar">
                <panel class="health-fill" />
            </panel>
        </panel>

        <quest-log class="quest-panel">
            <h3>The Forgotten Gate</h3>
            <span>Find the key beneath the old watchtower.</span>
        </quest-log>

        <hotbar class="hotbar">
            <inventory-slot class="selected">1 Sword</inventory-slot>
            <inventory-slot>2 Bow</inventory-slot>
            <inventory-slot>3 Potion</inventory-slot>
            <inventory-slot>4 Torch</inventory-slot>
        </hotbar>
    </ui>
)}

fn fail(message)
    Win32.MessageBoxA(0,message,"LazyUI",Win32.MB_OK+Win32.MB_ICONERROR)
    return 1
end

fn run_window(root,title,width,height)
    if GLFW.lsxLoadLibraries() < 1 or GLFW.glfwInit() == 0 then
        return fail("GLFW initialization failed.")
    end

    GLFW.glfwWindowHint(GLFW.GLFW_CONTEXT_VERSION_MAJOR,4)
    GLFW.glfwWindowHint(GLFW.GLFW_CONTEXT_VERSION_MINOR,6)
    GLFW.glfwWindowHint(GLFW.GLFW_OPENGL_PROFILE,GLFW.GLFW_OPENGL_CORE_PROFILE)

    local window = GLFW.glfwCreateWindow(width,height,title,0,0)
    if window == 0 then
        GLFW.glfwTerminate()
        GLFW.lsxUnloadLibraries()
        return fail("Window creation failed.")
    end

    GLFW.glfwMakeContextCurrent(window)
    GLFW.glfwSwapInterval(1)
    if GL.lsxLoadOpenGL() < 1 then
        GLFW.glfwDestroyWindow(window)
        GLFW.glfwTerminate()
        GLFW.lsxUnloadLibraries()
        return fail("OpenGL loading failed.")
    end

    local document = UI.document(root)
    local renderer = UIRenderer.create(null,64)
    if not renderer.ready then
        document.destroy()
        renderer.destroy()
        GLFW.glfwDestroyWindow(window)
        GLFW.glfwTerminate()
        GLFW.lsxUnloadLibraries()
        return fail("LazyUI renderer initialization failed.")
    end

    local window_input = UI.connect_window_input(window,document)
    local framebuffer = GLFW.FramebufferSize.new()
    local window_size = GLFW.WindowSize.new()
    local cursor = GLFW.CursorPosition.new()
    local mouse_down = false

    while GLFW.glfwWindowShouldClose(window) == 0 do
        framebuffer.refresh(window)
        window_size.refresh(window)
        cursor.refresh(window)

        document.resize(framebuffer.width,framebuffer.height)
        document.pointer_move_scaled(
            cursor.x,
            cursor.y,
            window_size.width,
            window_size.height
        )

        local pressed = GLFW.glfwGetMouseButton(
            window,
            GLFW.GLFW_MOUSE_BUTTON_LEFT
        ) == GLFW.GLFW_PRESS

        if pressed and not mouse_down then
            document.pointer_down_button(GLFW.GLFW_MOUSE_BUTTON_LEFT)
        end
        if not pressed and mouse_down then
            document.pointer_up_button(GLFW.GLFW_MOUSE_BUTTON_LEFT)
        end
        mouse_down = pressed

        GL.glViewport(0,0,framebuffer.width,framebuffer.height)
        GL.glClearColor(0.03,0.05,0.08,1.0)
        GL.glClear(GL.GL_COLOR_BUFFER_BIT)

        renderer.begin(framebuffer.width,framebuffer.height)
        renderer.submit(root)
        renderer.flush()

        GLFW.glfwSwapBuffers(window)
        GLFW.glfwPollEvents()
    end

    window_input.destroy()
    cursor.destroy()
    window_size.destroy()
    framebuffer.destroy()
    document.destroy()
    renderer.destroy()
    GLFW.glfwDestroyWindow(window)
    GLFW.glfwTerminate()
    GLFW.lsxUnloadLibraries()
    return 0
end

fn main()
    local root = hud_view()
    return run_window(root,"Runtime HUD",1280,760)
end`;

const examples = [
  {
    id: 'welcome-panel',
    title: 'A clean welcome panel',
    description: 'Start with a centered card, a heading, supporting text, and one working action. The complete file includes the native window, input, renderer, event handler, and cleanup.',
    note: 'The LSHTML tree is retained after creation. LSCSS is compiled into direct style operations; it is not browser CSS at runtime.',
    tabs: {
      'Complete main.lsx': welcomeCompleteSource,
      'LSHTML': `lshtml welcome_view(props) = {(
    <ui class="screen">
        <panel class="welcome-card">
            <badge class="eyebrow">WELCOME</badge>
            <h2>{props.title}</h2>
            <span class="message">{props.message}</span>
            <button class="primary" onclick={create_clicked} context={props}>
                Create Project
            </button>
            <statusbar id="welcome-status" class="status">
                Ready to begin.
            </statusbar>
        </panel>
    </ui>
)}`,
      'LSCSS': `lscss .screen = {
    width = "100vw"
    height = "100vh"
    align_items = "center"
    justify_content = "center"
    background = "linear-gradient(135deg, #0d1521, #18263a)"
    color = "#edf4ff"
}

lscss .welcome-card = {
    width = "420px"
    padding = "22px"
    gap = "11px"
    background = "#172335"
    border = "1px #3b5272"
    border_radius = "14px"
    box_shadow = "0 18px 40px 0 rgba(0,0,0,0.35)"
}

lscss .eyebrow = {
    color = "#79aef8"
    font_size = "11px"
}

lscss .message = {
    color = "#aebed3"
}

lscss .primary = {
    height = "40px"
    padding = "9px 15px"
    background = "linear-gradient(90deg, #3e83ed, #7258d8)"
    border = "1px #83aaf0"
    border_radius = "8px"
    color = "#ffffff"
    cursor = "pointer"
    hover = {
        background = "linear-gradient(90deg, #5597ff, #866ce8)"
    }
    active = {
        translate_y = "1px"
    }
}

lscss .status = {
    min_height = "30px"
    padding = "6px 9px"
    background = "#101a28"
    border = "1px #2d415c"
    border_radius = "7px"
    color = "#8fb9f5"
}`,
      'Props and click': `const WelcomeProps = {
    title = "Build Something New"
    message = "LazyUI keeps familiar markup while compiling to native code."
}

fn create_clicked(element,event,props)
    local status = props.document.find("#welcome-status")
    if status ~= null then
        status.set_text("Project creation started.")
    end
    return 0
end`
    },
    preview: () => `
      <div class="demo-panel" data-welcome-demo>
        <span style="color:#79aef8;font-size:11px;font-weight:800;letter-spacing:.12em">WELCOME</span>
        <h3>Build Something New</h3>
        <p>LazyUI keeps familiar markup while compiling to native code.</p>
        <button class="demo-action" data-create-project>Create Project</button>
        <div class="demo-status" data-welcome-status>Ready to begin.</div>
      </div>`,
    init: root => {
      const button = root.querySelector('[data-create-project]');
      const status = root.querySelector('[data-welcome-status]');
      button.addEventListener('click', () => status.textContent = 'Project creation started.');
    }
  },
  {
    id: 'button-events',
    title: 'Button events and a counter',
    description: 'Pass the state object through context, read a value from the clicked button, and update one retained text element.',
    note: 'CounterText owns a reusable text buffer, so frequently changing counters do not need to allocate a new string every time.',
    tabs: {
      'Complete main.lsx': counterCompleteSource,
      'LSHTML': `lshtml counter_view(props) = {(
    <ui class="screen">
        <panel class="counter-card">
            <h3>Party Size</h3>
            <row class="counter-row">
                <button class="counter-button" number-value=-1
                    onclick={change_count} context={props}>-</button>
                <span id="count-value" class="count-value">0</span>
                <button class="counter-button" number-value=1
                    onclick={change_count} context={props}>+</button>
            </row>
            <span class="hint">Choose between 0 and 8 party members.</span>
        </panel>
    </ui>
)}`,
      'LSCSS': `lscss .screen = {
    width = "100vw"
    height = "100vh"
    align_items = "center"
    justify_content = "center"
    background = "linear-gradient(135deg, #0d1521, #18263a)"
    color = "#edf4ff"
}

lscss .counter-card = {
    width = "330px"
    padding = "18px"
    gap = "12px"
    background = "#172335"
    border = "1px #3b5272"
    border_radius = "12px"
}

lscss .counter-row = {
    flex_direction = "row"
    align_items = "center"
    justify_content = "center"
    gap = "14px"
    padding = "14px"
    background = "#101a28"
    border_radius = "9px"
}

lscss .counter-button = {
    width = "48px"
    height = "42px"
    background = "#263b58"
    border = "1px #4f7099"
    border_radius = "8px"
    color = "#ffffff"
    font_size = "22px"
    cursor = "pointer"
    hover = {
        background = "#315078"
    }
}

lscss .count-value = {
    width = "64px"
    color = "#9fc4ff"
    font_size = "30px"
    text_align = "center"
}

lscss .hint = {
    color = "#93a6bc"
    text_align = "center"
}`,
      'Props and event': `const CounterProps = {
    count = 0
    text = null
    document = null
}

fn change_count(element,event,props)
    props.count = props.count + element.number_value
    if props.count < 0 then props.count = 0 end
    if props.count > 8 then props.count = 8 end

    local value = props.document.find("#count-value")
    if value ~= null then
        value.set_text(props.text.set_i64(props.count))
    end
    return 0
end`
    },
    preview: () => `
      <div class="demo-panel" data-counter-demo>
        <h3 style="text-align:center">Party Size</h3>
        <div class="demo-counter-row">
          <button class="demo-round-button" data-counter-change="-1">−</button>
          <span class="demo-count" data-counter-value>0</span>
          <button class="demo-round-button" data-counter-change="1">+</button>
        </div>
        <p style="text-align:center;font-size:12px">Choose between 0 and 8 party members.</p>
      </div>`,
    init: root => {
      let count = 0;
      const value = root.querySelector('[data-counter-value]');
      root.querySelectorAll('[data-counter-change]').forEach(button => {
        button.addEventListener('click', () => {
          count = Math.max(0, Math.min(8, count + Number(button.dataset.counterChange)));
          value.textContent = String(count);
        });
      });
    }
  },
  {
    id: 'input-form',
    title: 'A form that responds while you type',
    description: 'Editable controls keep their own retained value. The input event can read element.value and update another element immediately.',
    note: 'LazyUI inputs support caret movement, selection, clipboard editing, placeholders, maxlength, Tab focus, and multiline textarea editing.',
    tabs: {
      'Complete main.lsx': formCompleteSource,
      'LSHTML': `lshtml profile_view(props) = {(
    <ui class="screen">
        <panel class="profile-form">
            <h3>Character Profile</h3>

            <label>Name</label>
            <input
                placeholder="Character name"
                maxlength=32
                oninput={name_changed}
                context={props}
            />

            <label>Notes</label>
            <textarea
                placeholder="Write a short note..."
                maxlength=300
                oninput={notes_changed}
                context={props}
            />

            <statusbar id="form-status" class="form-status">
                Start typing to update this message.
            </statusbar>
        </panel>
    </ui>
)}`,
      'LSCSS': `lscss .screen = {
    width = "100vw"
    height = "100vh"
    align_items = "center"
    justify_content = "center"
    background = "linear-gradient(135deg, #0d1521, #18263a)"
    color = "#edf4ff"
}

lscss .profile-form = {
    width = "430px"
    padding = "20px"
    gap = "9px"
    background = "#162131"
    border = "1px #334a67"
    border_radius = "12px"
}

lscss label = {
    color = "#aebed3"
}

lscss input, textarea = {
    width = "100%"
    padding = "9px 10px"
    background = "#0f1722"
    border = "1px #324762"
    border_radius = "7px"
    color = "#ffffff"
    focus = {
        border = "1px #75a7ee"
        outline = "2px rgba(117,167,238,0.20)"
    }
}

lscss textarea = {
    height = "100px"
    overflow_y = "auto"
}

lscss .form-status = {
    min_height = "30px"
    padding = "6px 9px"
    background = "#101a28"
    color = "#8fb9f5"
    border_radius = "7px"
}`,
      'Input events': `const FormProps = {
    name = ""
    notes = ""
    document = null
}

fn name_changed(element,event,props)
    if element.value == null then props.name = ""
    else props.name = element.value end

    local status = props.document.find("#form-status")
    if status ~= null then
        if string.length(props.name) == 0 then
            status.set_text("Enter a character name.")
        else
            status.set_text(props.name)
        end
    end
    return 0
end

fn notes_changed(element,event,props)
    if element.value == null then props.notes = ""
    else props.notes = element.value end

    local status = props.document.find("#form-status")
    if status ~= null then
        if string.length(props.notes) == 0 then
            status.set_text("Write a short note.")
        else
            status.set_text("Notes updated.")
        end
    end
    return 0
end`
    },
    preview: () => `
      <div class="demo-form" data-form-demo>
        <h3>Character Profile</h3>
        <label>Name</label>
        <input type="text" maxlength="32" placeholder="Character name" data-profile-name>
        <label>Notes</label>
        <textarea maxlength="300" placeholder="Write a short note..." data-profile-notes></textarea>
        <div class="demo-status" data-form-status>Start typing to update this message.</div>
      </div>`,
    init: root => {
      const name = root.querySelector('[data-profile-name]');
      const notes = root.querySelector('[data-profile-notes]');
      const status = root.querySelector('[data-form-status]');
      name.addEventListener('input', () => status.textContent = name.value || 'Enter a character name.');
      notes.addEventListener('input', () => status.textContent = notes.value ? 'Notes updated.' : 'Write a short note.');
    }
  },
  {
    id: 'scrolling',
    title: 'A real scrolling inventory panel',
    description: 'Give the content area a fixed height, prevent it from growing, and set overflow_y. LazyUI handles the wheel, Page Up, Page Down, clipping, and draggable scrollbar.',
    note: 'Use overflow_y = "auto" to show the bar only when needed. Use "scroll" when the panel should always reserve scrolling behavior. The current native scrollbar colors are renderer-controlled.',
    tabs: {
      'Complete main.lsx': scrollingCompleteSource,
      'LSHTML': `lshtml inventory_view = {(
    <ui class="screen">
        <panel class="inventory-card">
            <row class="inventory-title">
                <h3>Inventory</h3>
                <spacer />
                <badge>12 items</badge>
            </row>

            <column class="inventory-scroll">
                <button class="inventory-item">Iron Sword</button>
                <button class="inventory-item">Leather Armor</button>
                <button class="inventory-item">Health Potion</button>
                <button class="inventory-item">Mana Potion</button>
                <button class="inventory-item">Old Map</button>
                <button class="inventory-item">Torch</button>
                <button class="inventory-item">Rope</button>
                <button class="inventory-item">Silver Key</button>
                <button class="inventory-item">Cooked Fish</button>
                <button class="inventory-item">Blue Crystal</button>
                <button class="inventory-item">Travel Cloak</button>
                <button class="inventory-item">Quest Letter</button>
            </column>
        </panel>
    </ui>
)}`,
      'LSCSS': `lscss .screen = {
    width = "100vw"
    height = "100vh"
    align_items = "center"
    justify_content = "center"
    background = "linear-gradient(135deg, #0d1521, #18263a)"
    color = "#edf4ff"
}

lscss .inventory-card = {
    width = "430px"
    padding = "16px"
    gap = "10px"
    background = "#162131"
    border = "1px #344b69"
    border_radius = "12px"
}

lscss .inventory-title = {
    height = "32px"
    flex_direction = "row"
    align_items = "center"
}

lscss .inventory-scroll = {
    height = "260px"
    min_height = "260px"
    max_height = "260px"
    flex_shrink = 0
    gap = "6px"
    padding = "4px 14px 4px 4px"
    overflow_x = "hidden"
    overflow_y = "auto"
}

lscss .inventory-item = {
    width = "100%"
    min_height = "46px"
    flex_shrink = 0
    padding = "9px 11px"
    background = "#111b29"
    border = "1px #2c405a"
    border_radius = "8px"
    color = "#e8f0fb"
    text_align = "left"
    cursor = "pointer"
    hover = {
        background = "#1b2a3e"
        border = "1px #49698f"
    }
}`,
      'How it works': `-- The important part is the scroll container:

lscss .inventory-scroll = {
    height = "260px"
    min_height = "260px"
    max_height = "260px"
    flex_shrink = 0
    overflow_y = "auto"
}

-- auto:
--   Show a scrollbar only when the content is taller.

-- scroll:
--   Keep scrolling enabled even before content overflows.

-- hidden:
--   Clip extra content and do not allow scrolling.

-- The children need real height. flex_shrink = 0 prevents
-- rows from shrinking until everything incorrectly fits.`
    },
    previewClass: 'align-stretch',
    preview: () => {
      const items = [
        ['SW', 'Iron Sword', 'Weapon'], ['AR', 'Leather Armor', 'Armor'],
        ['HP', 'Health Potion', 'Consumable'], ['MP', 'Mana Potion', 'Consumable'],
        ['MP', 'Old Map', 'Quest item'], ['TR', 'Torch', 'Tool'],
        ['RP', 'Rope', 'Tool'], ['KY', 'Silver Key', 'Key item'],
        ['FD', 'Cooked Fish', 'Food'], ['CR', 'Blue Crystal', 'Material'],
        ['CL', 'Travel Cloak', 'Armor'], ['LT', 'Quest Letter', 'Quest item']
      ];
      return `<div class="demo-scroll-shell"><h3>Inventory <span style="float:right;color:#8fa5bf;font-size:12px">12 items</span></h3><div class="demo-scroll-list">${items.map(([icon, name, kind]) => `<div class="demo-item"><span class="demo-item-icon">${icon}</span><span><b>${name}</b><small>${kind}</small></span><span style="color:#7890ab">›</span></div>`).join('')}</div></div>`;
    }
  },
  {
    id: 'tabs',
    title: 'Tabs without keeping every page visible',
    description: 'Create the tab pages once, then change each page hidden flag. This keeps the retained elements while rendering and interacting with only the active page.',
    note: 'For very large editor pages, you can also create a tab page only when it is opened and cache the resulting retained element for later reuse.',
    tabs: {
      'Complete main.lsx': tabsCompleteSource,
      'LSHTML': `lshtml settings_view(props) = {(
    <ui class="screen">
        <panel class="settings-card">
            <row class="tabs">
                <button id="graphics-tab" class="tab active" value="graphics"
                    onclick={open_tab} context={props}>Graphics</button>
                <button id="audio-tab" class="tab" value="audio"
                    onclick={open_tab} context={props}>Audio</button>
                <button id="gameplay-tab" class="tab" value="gameplay"
                    onclick={open_tab} context={props}>Gameplay</button>
            </row>

            <column id="graphics-page" class="tab-page">
                <h3>Graphics</h3>
                <checkbox checked>Bloom</checkbox>
                <checkbox checked>Ambient Occlusion</checkbox>
            </column>

            <column id="audio-page" class="tab-page" hidden>
                <h3>Audio</h3>
                <range min=0 max=100 step=1 number-value=72 />
                <checkbox checked>Spatial Audio</checkbox>
            </column>

            <column id="gameplay-page" class="tab-page" hidden>
                <h3>Gameplay</h3>
                <checkbox checked>Show Tutorials</checkbox>
                <checkbox>Auto Save</checkbox>
            </column>
        </panel>
    </ui>
)}`,
      'LSCSS': `lscss .screen = {
    width = "100vw"
    height = "100vh"
    align_items = "center"
    justify_content = "center"
    background = "linear-gradient(135deg, #0d1521, #18263a)"
    color = "#edf4ff"
}

lscss .settings-card = {
    width = "460px"
    background = "#151f2d"
    border = "1px #364c68"
    border_radius = "12px"
    overflow = "hidden"
}

lscss .tabs = {
    height = "48px"
    flex_direction = "row"
    gap = "4px"
    padding = "8px 8px 0px 8px"
    background = "#111a27"
    border_bottom = "1px #2b3d56"
}

lscss .tab = {
    padding = "9px 12px"
    background = "rgba(0,0,0,0)"
    border_radius = "7px 7px 0px 0px"
    color = "#8fa0b6"
    cursor = "pointer"
}

lscss .tab.active = {
    background = "#22344d"
    color = "#ffffff"
}

lscss .tab-page = {
    min_height = "220px"
    padding = "20px"
    gap = "10px"
}`,
      'Tab behavior': `const SettingsProps = {
    active_tab = "graphics"
    document = null
}

fn set_tab(document,button_selector,page_selector,is_active)
    local button = document.find(button_selector)
    local page = document.find(page_selector)

    if button ~= null then
        if is_active then button.add_class("active")
        else button.remove_class("active") end
    end

    if page ~= null then
        page.hidden = not is_active
    end
end

fn open_tab(element,event,props)
    props.active_tab = element.value

    set_tab(props.document,"#graphics-tab","#graphics-page",props.active_tab == "graphics")
    set_tab(props.document,"#audio-tab","#audio-page",props.active_tab == "audio")
    set_tab(props.document,"#gameplay-tab","#gameplay-page",props.active_tab == "gameplay")
    return 0
end`
    },
    preview: () => `
      <div class="demo-tabs" data-tabs-demo>
        <div class="demo-tab-buttons">
          <button class="demo-tab-button active" data-tab="graphics">Graphics</button>
          <button class="demo-tab-button" data-tab="audio">Audio</button>
          <button class="demo-tab-button" data-tab="gameplay">Gameplay</button>
        </div>
        <div class="demo-tab-page" data-page="graphics">
          <h3>Graphics</h3>
          <div class="demo-setting"><span>Bloom</span><button class="demo-switch on" aria-label="Toggle bloom"></button></div>
          <div class="demo-setting"><span>Ambient Occlusion</span><button class="demo-switch on" aria-label="Toggle ambient occlusion"></button></div>
        </div>
        <div class="demo-tab-page" data-page="audio" hidden>
          <h3>Audio</h3>
          <div class="demo-setting"><span>Master Volume</span><input type="range" value="72"></div>
          <div class="demo-setting"><span>Spatial Audio</span><button class="demo-switch on" aria-label="Toggle spatial audio"></button></div>
        </div>
        <div class="demo-tab-page" data-page="gameplay" hidden>
          <h3>Gameplay</h3>
          <div class="demo-setting"><span>Show Tutorials</span><button class="demo-switch on" aria-label="Toggle tutorials"></button></div>
          <div class="demo-setting"><span>Auto Save</span><button class="demo-switch" aria-label="Toggle auto save"></button></div>
        </div>
      </div>`,
    init: root => {
      const buttons = [...root.querySelectorAll('[data-tab]')];
      const pages = [...root.querySelectorAll('[data-page]')];
      buttons.forEach(button => button.addEventListener('click', () => {
        buttons.forEach(item => item.classList.toggle('active', item === button));
        pages.forEach(page => page.hidden = page.dataset.page !== button.dataset.tab);
      }));
    }
  },
  {
    id: 'game-hud',
    title: 'A practical game HUD',
    description: 'LazyUI is not limited to editor windows. Build health bars, quest cards, notifications, hotbars, menus, and runtime overlays with the same retained element system.',
    note: 'Runtime code can change progress-fill width, text, visibility, images, and classes without rebuilding the entire HUD tree.',
    tabs: {
      'Complete main.lsx': hudCompleteSource,
      'LSHTML': `lshtml hud_view = {(
    <ui class="screen">
        <canvas class="world">
            <circle cx=250 cy=210 r=110 fill="#3e6d45" />
            <ellipse cx=660 cy=310 rx=290 ry=115 fill="#285279" />
            <polygon points="0,520 300,330 580,510 920,260 1280,520"
                fill="#263f32" />
        </canvas>

        <panel class="health-panel">
            <row>
                <span>Health</span>
                <spacer />
                <span>74 / 100</span>
            </row>
            <panel class="health-bar">
                <panel class="health-fill" />
            </panel>
        </panel>

        <quest-log class="quest-panel">
            <h3>The Forgotten Gate</h3>
            <span>Find the key beneath the old watchtower.</span>
        </quest-log>

        <hotbar class="hotbar">
            <inventory-slot class="selected">1 Sword</inventory-slot>
            <inventory-slot>2 Bow</inventory-slot>
            <inventory-slot>3 Potion</inventory-slot>
            <inventory-slot>4 Torch</inventory-slot>
        </hotbar>
    </ui>
)}`,
      'LSCSS': `lscss .screen = {
    width = "100vw"
    height = "100vh"
    position = "relative"
    background = "linear-gradient(180deg, #22384d, #101821)"
    color = "#edf4ff"
}

lscss .world = {
    position = "absolute"
    left = "0px"
    top = "0px"
    width = "100vw"
    height = "100vh"
}

lscss .health-panel = {
    position = "absolute"
    left = "16px"
    top = "16px"
    width = "210px"
    padding = "10px"
    gap = "6px"
    background = "rgba(8,13,20,0.86)"
    border = "1px #3b506d"
    border_radius = "9px"
}

lscss .health-bar = {
    height = "12px"
    background = "#2c1720"
    border_radius = "6px"
    overflow = "hidden"
}

lscss .health-fill = {
    width = "74%"
    height = "100%"
    background = "linear-gradient(90deg, #c74354, #f17b75)"
}

lscss .quest-panel = {
    position = "absolute"
    right = "16px"
    top = "16px"
    width = "250px"
    padding = "11px"
    gap = "6px"
    background = "rgba(8,13,20,0.86)"
    border = "1px #3b506d"
    border_radius = "9px"
}

lscss .hotbar = {
    position = "absolute"
    left = "50%"
    bottom = "14px"
    translate_x = "-50%"
    flex_direction = "row"
    gap = "5px"
}

lscss inventory-slot = {
    width = "78px"
    height = "54px"
    align_items = "center"
    justify_content = "center"
    background = "rgba(8,13,20,0.86)"
    border = "1px #3b506d"
    border_radius = "7px"
}

lscss inventory-slot.selected = {
    border = "2px #8ebcff"
    background = "rgba(34,60,91,0.94)"
}`

    },
    preview: () => `
      <div class="demo-hud">
        <div class="hud-health"><div class="hud-health-row"><span>Health</span><span>74 / 100</span></div><div class="hud-bar"><div class="hud-fill"></div></div></div>
        <div class="hud-quest"><strong>The Forgotten Gate</strong><span>Find the key beneath the old watchtower.</span></div>
        <div class="hud-hotbar"><div class="hud-slot selected">1<br>SWD</div><div class="hud-slot">2<br>BOW</div><div class="hud-slot">3<br>HP</div><div class="hud-slot">4<br>TRC</div></div>
      </div>`
  }
];

const elementGroups = [
  { title: 'Layout', description: 'Build structure and control direction, spacing, and sizing.', tags: ['ui', 'panel', 'row', 'column', 'grid', 'spacer', 'section', 'divider'] },
  { title: 'Text and actions', description: 'Display information and let the user perform actions.', tags: ['h1-h6', 'span', 'label', 'button', 'badge', 'chip', 'statusbar'] },
  { title: 'Text input', description: 'Editable single-line and multiline fields with retained input state.', tags: ['input', 'search', 'password', 'email', 'number', 'textarea', 'keybind'] },
  { title: 'Choices', description: 'Boolean, exclusive, ranged, and list-based controls.', tags: ['checkbox', 'radio', 'toggle', 'switch', 'range', 'slider', 'select', 'combobox'] },
  { title: 'Media and drawing', description: 'Images, video-style surfaces, and declarative retained canvas shapes.', tags: ['img', 'canvas', 'rect', 'circle', 'ellipse', 'line', 'polygon', 'canvas-text'] },
  { title: 'Editor UI', description: 'Useful semantic elements for inspectors, docks, projects, trees, and consoles.', tags: ['dockpanel', 'inspector', 'property', 'treeitem', 'thumbnail', 'console', 'tab'] },
  { title: 'Game UI', description: 'Runtime overlays for health, inventory, quests, maps, and menus.', tags: ['hud', 'panel', 'progress', 'hotbar', 'inventory-slot', 'quest-log', 'notification'] },
  { title: 'Scrolling', description: 'Any panel or column can scroll when its size is constrained and overflow is enabled.', tags: ['overflow_y="auto"', 'overflow_y="scroll"', 'overflow_x="hidden"'] },
  { title: 'Events', description: 'Attach LSX functions directly and pass an ordinary context object.', tags: ['onclick', 'oninput', 'onchange', 'onpointerdown', 'onpointermove', 'onscroll', 'context'] }
];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1600);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  showToast('Copied to clipboard');
}

function renderExamples() {
  const root = document.getElementById('examples-root');
  examples.forEach((example, index) => {
    const article = document.createElement('article');
    article.className = 'example-card';
    article.id = example.id;
    article.dataset.search = `${example.title} ${example.description} ${Object.values(example.tabs).join(' ')}`.toLowerCase();
    const tabNames = Object.keys(example.tabs);
    article.innerHTML = `
      <div class="example-header">
        <div><h3>${escapeHtml(example.title)}</h3><p>${escapeHtml(example.description)}</p></div>
        <span class="example-number">EXAMPLE ${String(index + 1).padStart(2, '0')}</span>
      </div>
      <div class="example-body">
        <div class="example-source">
          <div class="code-tabs">${tabNames.map((name, tabIndex) => `<button class="code-tab${tabIndex === 0 ? ' active' : ''}" data-example-tab="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('')}</div>
          <div class="example-code-wrap">
            <button class="copy-button" data-copy-example>Copy</button>
            <pre><code>${escapeHtml(example.tabs[tabNames[0]])}</code></pre>
          </div>
        </div>
        <div class="example-preview">
          <div class="preview-label">Live visual equivalent rendered with browser HTML, CSS, and JavaScript</div>
          <div class="preview-stage ${example.previewClass || ''}">${example.preview()}</div>
          <div class="example-note">${escapeHtml(example.note)}</div>
        </div>
      </div>`;

    let currentTab = tabNames[0];
    const codeElement = article.querySelector('.example-code-wrap code');
    article.querySelectorAll('[data-example-tab]').forEach(button => {
      button.addEventListener('click', () => {
        currentTab = button.dataset.exampleTab;
        article.querySelectorAll('[data-example-tab]').forEach(item => item.classList.toggle('active', item === button));
        codeElement.textContent = example.tabs[currentTab];
      });
    });
    article.querySelector('[data-copy-example]').addEventListener('click', () => copyText(example.tabs[currentTab]));
    root.appendChild(article);
    if (example.init) example.init(article.querySelector('.preview-stage'));
  });
}

function renderElementGrid() {
  const root = document.getElementById('element-grid');
  root.innerHTML = elementGroups.map(group => `
    <article class="element-card">
      <h3>${escapeHtml(group.title)}</h3>
      <p>${escapeHtml(group.description)}</p>
      <div class="tag-list">${group.tags.map(tag => `<code>${escapeHtml(tag)}</code>`).join('')}</div>
    </article>`).join('');
}

function setupCopyButtons() {
  document.querySelectorAll('[data-copy-target]').forEach(button => {
    button.addEventListener('click', () => {
      const target = document.getElementById(button.dataset.copyTarget);
      copyText(target.textContent);
    });
  });
}

function setupLivePreviewControls() {
  document.querySelectorAll('.demo-switch').forEach(button => {
    if (!button.dataset.switchReady) {
      button.dataset.switchReady = '1';
      button.addEventListener('click', () => button.classList.toggle('on'));
    }
  });
}

function setupNavigation() {
  const sidebar = document.getElementById('sidebar');
  document.getElementById('menu-button').addEventListener('click', () => sidebar.classList.toggle('open'));
  document.querySelectorAll('.nav-link').forEach(link => link.addEventListener('click', () => sidebar.classList.remove('open')));

  const sections = [...document.querySelectorAll('main .doc-section')];
  const links = [...document.querySelectorAll('.nav-link')];
  const observer = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    links.forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${visible.target.id}`));
  }, { rootMargin: '-20% 0px -68% 0px', threshold: [0, .1, .3] });
  sections.forEach(section => observer.observe(section));
}

function setupGuideSearch() {
  const input = document.getElementById('site-search');
  const results = document.getElementById('site-search-results');
  const searchable = [
    ...document.querySelectorAll('.doc-section'),
    ...document.querySelectorAll('.example-card')
  ];

  function close() { results.hidden = true; results.innerHTML = ''; }
  input.addEventListener('input', () => {
    const term = input.value.trim().toLowerCase();
    if (term.length < 2) { close(); return; }
    const matches = searchable.filter(item => {
      const text = `${item.dataset.search || ''} ${item.textContent}`.toLowerCase();
      return text.includes(term);
    }).slice(0, 9);
    if (!matches.length) {
      results.innerHTML = '<div class="search-result"><strong>No guide result</strong><span>Try the advanced API search below.</span></div>';
      results.hidden = false;
      return;
    }
    results.innerHTML = matches.map(item => {
      const heading = item.querySelector('h1,h2,h3');
      const title = heading ? heading.textContent : item.id;
      const section = item.closest('.doc-section');
      const label = item.classList.contains('example-card') ? 'Live example' : 'Guide section';
      return `<a class="search-result" href="#${escapeHtml(item.id || section.id)}"><strong>${escapeHtml(title)}</strong><span>${label}</span></a>`;
    }).join('');
    results.hidden = false;
    results.querySelectorAll('a').forEach(link => link.addEventListener('click', close));
  });
  document.addEventListener('click', event => {
    if (!results.contains(event.target) && event.target !== input) close();
  });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      input.focus();
      input.select();
    }
    if (event.key === 'Escape') close();
  });
}

const API_CATEGORY_DEFINITIONS = [
  { label: 'Language', description: 'Startup, variables, control flow, functions, tables, objects, modules, strings, and errors', test: module => module.startsWith('Language/') },
  { label: 'User interface', description: 'LazyUI, LSHTML, LSCSS, elements, events, documents, input, and rendering', test: module => module.startsWith('UI/') || module.startsWith('LazyUI/') },
  { label: 'Math and cameras', description: 'GLM vectors, matrices, quaternions, transforms, and cameras', test: module => module.startsWith('Math/') },
  { label: 'Graphics and images', description: 'Images, textures, media, and OpenGL', test: module => module.startsWith('Graphics/') || module === 'OpenGL' || module.startsWith('OpenGL/') },
  { label: 'Windowing and platform', description: 'GLFW and operating-system helpers', test: module => module === 'GLFW' || module.startsWith('Platform/') },
  { label: 'Audio', description: 'OpenAL playback and WAV loading', test: module => module === 'OpenAL' || module.startsWith('OpenAL/') },
  { label: 'Text and fonts', description: 'SDF fonts, FreeType, glyphs, atlases, and text meshes', test: module => module.startsWith('Text/') },
  { label: 'Data, files, and logs', description: 'JSON, file access, and logging', test: module => module.startsWith('Data/') || module === 'System/File' || module === 'System/Log' },
  { label: 'Networking', description: 'HTTP, sockets, and WinSock', test: module => module.startsWith('Network/') },
  { label: 'Threading', description: 'Threads, locks, events, atomics, and synchronization', test: module => module === 'System/Threading' }
];

const BACKEND_CATEGORY_DEFINITIONS = [
  { label: 'Native graphics and audio', description: 'Raw OpenGL, OpenAL, texture upload, shader, and media declarations', test: module => module === 'OpenGL' || module === 'OpenAL' || module.startsWith('OpenGL/') || module.startsWith('OpenAL/') || module === 'UI/ShaderSources' },
  { label: 'Windowing and Windows', description: 'Raw GLFW and Win32 functions, constants, handles, and callbacks', test: module => module === 'GLFW' || module.startsWith('Platform/') },
  { label: 'LazyUI internals', description: 'Internal retained records, fixed layouts, hashes, renderer plumbing, and canvas command storage', test: module => module === 'UI/LazyUI' || module === 'UI/Renderer' },
  { label: 'Native math and data bridges', description: 'GLM ABI bridges, raw image/font bindings, and fixed native records', test: module => module === 'Math/GLMRaw' || module === 'Graphics/STBImage' || module === 'Text/FreeTypeRaw' },
  { label: 'Networking internals', description: 'Raw WinSock functions and native networking records', test: module => module === 'Network/WinSockRaw' },
  { label: 'Other backend entries', description: 'Advanced and internal declarations kept away from the front-end API', test: module => true }
];

function apiEntryKey(entry) {
  return `${entry.module}|${entry.source}|${entry.line}|${entry.owner || ''}|${entry.name}`;
}

function entryNameText(entry) {
  return `${entry.owner ? `${entry.owner}.` : ''}${entry.name}`;
}

function namesContain(entry, words) {
  const name = `${entry.owner || ''} ${entry.name}`.toLowerCase();
  return words.some(word => name.includes(word));
}

function buildSpecialTopLevelGroups(module, topEntries) {
  const rules = [];
  if (module.startsWith('Language/')) {
    rules.push(
      ['Inheritance and constructors', entry => entry.module === 'Language/Inheritance' || namesContain(entry, ['base object', 'inherited', 'derived constructor', 'base constructor', 'override', 'common base', 'gettypename', 'istype'])],
      ['Start here', entry => namesContain(entry, ['setup', 'project', 'build', 'main', 'entry'])],
      ['Values and variables', entry => namesContain(entry, ['local', 'const', 'value', 'variable', 'assignment', 'null'])],
      ['Conditions and loops', entry => namesContain(entry, ['if', 'elseif', 'else', 'while', 'for', 'break', 'condition'])],
      ['Functions', entry => namesContain(entry, ['function', 'parameter', 'return', 'call'])],
      ['Tables and buffers', entry => namesContain(entry, ['table', 'push', 'get', 'length', 'remove', 'clear', 'buffer', 'positional', 'byte'])],
      ['Static managers and services', entry => entry.module === 'Language/Static objects' || namesContain(entry, ['static object', 'singleton', 'shared static', 'static method', 'static field', 'shutdown'])],
      ['Objects and modules', entry => namesContain(entry, ['object', 'field', 'method', 'new', 'destroy', 'module', 'import', 'use'])]
    );
  } else if (module === 'LazyUI/Start here') {
    rules.push(
      ['Build the interface', entry => namesContain(entry, ['build a simple interface', 'ids and classes'])],
      ['Find and change elements', entry => namesContain(entry, ['find an element', 'change text'])],
      ['Attach events', entry => namesContain(entry, ['event listener'])]
    );
  } else if (module === 'Math/GLM') {
    rules.push(
      ['Setup and scalar helpers', entry => namesContain(entry, ['ready', 'version_', 'pi', 'epsilon', 'radians', 'degrees', 'clamp', 'mix', 'step', 'fract', 'mod', 'sign', 'sqrt']) || entry.kind === 'constant'],
      ['Vector creation', entry => /^vec[234]/i.test(entry.name)],
      ['Matrix creation and conversion', entry => /^(mat[234]|normal_matrix)/i.test(entry.name)],
      ['Quaternion creation', entry => /^quat/i.test(entry.name)],
      ['Dual quaternions', entry => /^dual_quat/i.test(entry.name)],
      ['Transforms and look-at matrices', entry => /^(trs|inverse_trs|look_at)/i.test(entry.name)],
      ['Perspective and orthographic projection', entry => /^(perspective|infinite_perspective|ortho)/i.test(entry.name)],
      ['Project, unproject, and decomposition', entry => /^(decompose|pick_matrix|project|unproject)/i.test(entry.name)]
    );
  } else if (module === 'UI/LazyUI') {
    rules.push(
      ['Documents, input, and lifecycle', entry => namesContain(entry, ['document', 'window_input', 'connect_', 'hash', 'update', 'event'])],
      ['Layout and containers', entry => namesContain(entry, ['panel', 'row', 'column', 'grid', 'group', 'split', 'scroll', 'tab', 'toolbar', 'statusbar', 'dock'])],
      ['Text, buttons, and form controls', entry => namesContain(entry, ['text', 'label', 'heading', 'button', 'input', 'textarea', 'checkbox', 'toggle', 'radio', 'select', 'range', 'slider', 'field'])],
      ['Images, canvas, and drawing', entry => namesContain(entry, ['image', 'img', 'canvas', 'draw', 'path', 'color'])],
      ['Editor and game widgets', entry => namesContain(entry, ['scene', 'viewport', 'graph', 'node', 'tree', 'hierarchy', 'inspector', 'property', 'asset', 'gizmo', 'hud', 'timeline'])]
    );
  } else if (module === 'GLFW') {
    rules.push(
      ['Initialization and version', entry => namesContain(entry, ['init', 'terminate', 'version', 'error'])],
      ['Windows and window state', entry => namesContain(entry, ['window', 'framebuffer', 'opacity', 'iconify', 'maximize', 'restore'])],
      ['Keyboard, mouse, cursor, and input', entry => namesContain(entry, ['key', 'mouse', 'cursor', 'input', 'clipboard'])],
      ['Monitors and video modes', entry => namesContain(entry, ['monitor', 'video', 'gamma', 'content_scale'])],
      ['OpenGL, Vulkan, and contexts', entry => namesContain(entry, ['context', 'swap', 'proc', 'vulkan', 'instance', 'surface'])],
      ['Events, time, and timers', entry => namesContain(entry, ['event', 'poll', 'wait', 'time', 'timer'])],
      ['Joysticks and gamepads', entry => namesContain(entry, ['joystick', 'gamepad'])]
    );
  } else if (module === 'OpenGL') {
    rules.push(
      ['Textures and samplers', entry => namesContain(entry, ['texture', 'tex', 'sampler'])],
      ['Buffers and mapped memory', entry => namesContain(entry, ['buffer', 'map', 'memory'])],
      ['Shaders, programs, and uniforms', entry => namesContain(entry, ['shader', 'program', 'uniform', 'attrib'])],
      ['Vertex input and drawing', entry => namesContain(entry, ['vertex', 'draw', 'primitive', 'patch'])],
      ['Framebuffers and renderbuffers', entry => namesContain(entry, ['framebuffer', 'renderbuffer', 'blit'])],
      ['Blending, depth, stencil, and raster state', entry => namesContain(entry, ['blend', 'depth', 'stencil', 'cull', 'polygon', 'scissor', 'viewport'])],
      ['Compute and image operations', entry => namesContain(entry, ['compute', 'dispatch', 'image', 'barrier'])],
      ['Queries, synchronization, and debugging', entry => namesContain(entry, ['query', 'sync', 'fence', 'debug', 'label', 'message'])],
      ['State inspection and capability queries', entry => namesContain(entry, ['get', 'is_', 'enable', 'disable'])]
    );
  } else if (module === 'OpenAL') {
    rules.push(
      ['Devices and contexts', entry => namesContain(entry, ['device', 'context', 'alc'])],
      ['Sources and playback', entry => namesContain(entry, ['source', 'play', 'pause', 'stop', 'rewind'])],
      ['Buffers and audio data', entry => namesContain(entry, ['buffer', 'format', 'frequency'])],
      ['Listener and spatial audio', entry => namesContain(entry, ['listener', 'distance', 'doppler', 'orientation'])],
      ['Effects, filters, and auxiliary slots', entry => namesContain(entry, ['effect', 'filter', 'auxiliary', 'eax'])]
    );
  } else if (module === 'System/Threading') {
    rules.push(
      ['Thread creation and control', entry => namesContain(entry, ['thread', 'sleep', 'yield', 'hardware'])],
      ['Synchronization primitives', entry => namesContain(entry, ['mutex', 'semaphore', 'event', 'critical', 'rwlock', 'condition'])],
      ['Atomic values', entry => namesContain(entry, ['atomic'])],
      ['Thread-local storage', entry => namesContain(entry, ['local'])]
    );
  } else if (module.startsWith('Text/')) {
    rules.push(
      ['Loading and setup', entry => namesContain(entry, ['load', 'open', 'create', 'ready', 'init'])],
      ['Glyphs, metrics, and layout', entry => namesContain(entry, ['glyph', 'metric', 'kerning', 'advance', 'measure', 'layout'])],
      ['Atlases, textures, and pixels', entry => namesContain(entry, ['atlas', 'texture', 'pixel', 'sdf'])],
      ['Meshes, instances, and rendering data', entry => namesContain(entry, ['mesh', 'instance', 'vertex', 'index'])]
    );
  } else if (module.startsWith('Network/')) {
    rules.push(
      ['Setup and addresses', entry => namesContain(entry, ['ready', 'init', 'address', 'addr', 'host', 'port'])],
      ['Connections and clients', entry => namesContain(entry, ['connect', 'client', 'socket', 'accept', 'listen'])],
      ['Send, receive, and requests', entry => namesContain(entry, ['send', 'receive', 'recv', 'request', 'response', 'get', 'post'])],
      ['Polling, errors, and status', entry => namesContain(entry, ['poll', 'error', 'status', 'close', 'timeout'])]
    );
  }

  const remaining = new Set(topEntries.map(apiEntryKey));
  const groups = [];
  rules.forEach(([label, test]) => {
    const matched = topEntries.filter(entry => remaining.has(apiEntryKey(entry)) && test(entry));
    if (!matched.length) return;
    matched.forEach(entry => remaining.delete(apiEntryKey(entry)));
    groups.push({ label, entries: matched });
  });

  const unmatched = topEntries.filter(entry => remaining.has(apiEntryKey(entry)));
  const kindOrder = ['typed function', 'raw function', 'constant', 'static object', 'typed object', 'typed struct', 'compiler feature', 'compiler method'];
  kindOrder.forEach(kind => {
    const matched = unmatched.filter(entry => entry.kind === kind);
    if (matched.length) groups.push({ label: kind.replace(/\b\w/g, char => char.toUpperCase()), entries: matched });
  });
  const known = new Set(kindOrder);
  const other = unmatched.filter(entry => !known.has(entry.kind));
  if (other.length) groups.push({ label: 'Other top-level entries', entries: other });
  return groups;
}

function buildModuleGroups(module, moduleEntries) {
  const groups = [];
  const claimed = new Set();
  const owners = [...new Set(moduleEntries.map(entry => entry.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  owners.forEach(owner => {
    const lowerOwner = owner.toLowerCase();
    const normalizedOwner = lowerOwner.replace(/[^a-z0-9]/g, '');
    const ownerEntries = moduleEntries.filter(entry => {
      if (claimed.has(apiEntryKey(entry))) return false;
      if (entry.owner === owner) return true;
      if (entry.owner) return false;
      if (entry.name === owner) return true;
      if (module !== 'Math/GLM') return false;
      if (lowerOwner === 'decomposition') return entry.name === 'decompose';
      const normalizedName = entry.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      return normalizedName === normalizedOwner || normalizedName.startsWith(normalizedOwner);
    });
    ownerEntries.forEach(entry => claimed.add(apiEntryKey(entry)));
    groups.push({ label: owner, entries: ownerEntries, owner: true });
  });
  const topEntries = moduleEntries.filter(entry => !entry.owner && !claimed.has(apiEntryKey(entry)));
  groups.push(...buildSpecialTopLevelGroups(module, topEntries));
  return groups.filter(group => group.entries.length);
}

function setupApiReference() {
  const allEntries = apiData.entries || [];
  const moduleSelect = document.getElementById('api-module');
  const kindSelect = document.getElementById('api-kind');
  const search = document.getElementById('api-search');
  const results = document.getElementById('api-results');
  const pageLabel = document.getElementById('api-page-label');
  const previous = document.getElementById('api-prev');
  const next = document.getElementById('api-next');
  const signatures = document.getElementById('show-signatures');
  const signatureWrap = document.getElementById('signature-toggle-wrap');
  const apiNavTree = document.getElementById('api-nav-tree');
  const apiNavSearch = document.getElementById('api-nav-search');
  const apiNavSearchLabel = document.getElementById('api-nav-search-label');
  const apiNavCount = document.getElementById('api-nav-count');
  const currentFilter = document.getElementById('api-current-filter');
  const currentFilterLabel = document.getElementById('api-current-filter-label');
  const clearNavFilter = document.getElementById('api-clear-nav-filter');
  const moduleGuide = document.getElementById('api-module-guide');
  const sidebar = document.getElementById('sidebar');
  const summary = document.getElementById('api-summary');
  const modeEyebrow = document.getElementById('api-mode-eyebrow');
  const modeTitle = document.getElementById('api-mode-title');
  const modeDescription = document.getElementById('api-mode-description');
  const helpTitle = document.getElementById('api-help-title');
  const helpText = document.getElementById('api-help-text');
  const frontendModeButton = document.getElementById('api-mode-frontend');
  const backendModeButton = document.getElementById('api-mode-backend');

  let page = 0;
  const pageSize = 20;
  let navFilter = null;
  let apiMode = 'frontend';
  let entries = [];
  let modules = [];
  let moduleEntries = new Map();
  let moduleGroups = new Map();

  function currentPaneName() {
    return apiMode === 'backend' ? 'backend' : 'api';
  }

  function applySidebarPane(name) {
    document.querySelectorAll('[data-sidebar-pane]').forEach(button => {
      const active = button.dataset.sidebarPane === name;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    const contentName = name === 'backend' ? 'api' : name;
    document.querySelectorAll('[data-sidebar-pane-content]').forEach(pane => {
      const active = pane.dataset.sidebarPaneContent === contentName;
      pane.hidden = !active;
      pane.classList.toggle('active', active);
    });
  }

  function modeEntries() {
    return allEntries.filter(entry => (entry.audience || 'frontend') === apiMode);
  }

  function clearSelect(select, label) {
    select.innerHTML = `<option value="">${escapeHtml(label)}</option>`;
  }

  function rebuildIndexes() {
    entries = modeEntries();
    modules = [...new Set(entries.map(entry => entry.module))].sort((a, b) => a.localeCompare(b));
    moduleEntries = new Map(modules.map(module => [module, entries.filter(entry => entry.module === module)]));
    moduleGroups = new Map(modules.map(module => [module, buildModuleGroups(module, moduleEntries.get(module))]));

    clearSelect(moduleSelect, 'All modules');
    modules.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = `${name} (${moduleEntries.get(name).length})`;
      moduleSelect.appendChild(option);
    });

    clearSelect(kindSelect, 'All entry types');
    const kinds = [...new Set(entries.map(entry => entry.kind))].sort((a, b) => a.localeCompare(b));
    kinds.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = `${name} (${entries.filter(entry => entry.kind === name).length})`;
      kindSelect.appendChild(option);
    });

    const countModule = prefix => entries.filter(entry => entry.module === prefix || entry.module.startsWith(`${prefix}/`)).length;
    const summaryItems = apiMode === 'frontend'
      ? [
          ['Front-end entries', entries.length],
          ['Modules', modules.length],
          ['Language', countModule('Language')],
          ['Inheritance', countModule('Language/Inheritance')],
          ['LazyUI', countModule('LazyUI') + countModule('UI/LazyUI')],
          ['High-level math', countModule('Math/GLM') + countModule('Math/Camera')]
        ]
      : [
          ['Backend entries', entries.length],
          ['Modules', modules.length],
          ['Raw functions', entries.filter(entry => entry.kind === 'raw function').length],
          ['Internal fields', entries.filter(entry => entry.kind === 'field').length],
          ['Native constants', entries.filter(entry => entry.kind === 'constant').length],
          ['Internal UI', countModule('UI/LazyUI') + countModule('UI/Renderer')]
        ];
    summary.innerHTML = summaryItems.map(([label, value]) => `<span class="stat-pill"><strong>${value.toLocaleString()}</strong> ${escapeHtml(label)}</span>`).join('');
    apiNavCount.textContent = `${entries.length.toLocaleString()} ${apiMode === 'frontend' ? 'front-end' : 'backend'} entries in ${modules.length} modules`;
  }

  function updateModeText() {
    const backend = apiMode === 'backend';
    frontendModeButton.classList.toggle('active', !backend);
    backendModeButton.classList.toggle('active', backend);
    signatureWrap.hidden = !backend;
    if (!backend) signatures.checked = false;

    modeEyebrow.textContent = backend ? 'Backend and native reference' : 'Front-end API reference';
    modeTitle.textContent = backend
      ? 'Raw declarations and internal layouts live here.'
      : 'Use the features you write in normal LSX code.';
    modeDescription.textContent = backend
      ? 'This separate view contains raw functions, native constants, fixed-layout fields, internal LazyUI records, renderer plumbing, and ABI-facing declarations. Normal game and engine code should start in the Front-end API.'
      : 'This view contains the LSX language, inheritance, high-level engine APIs, LSHTML, LSCSS, document lookup, and events. Native layouts, internal fields, raw bindings, and compiler-facing declarations are kept in the separate Backend tab.';
    helpTitle.textContent = backend ? 'Use this only when extending a binding or runtime system.' : 'Start with a job, not a native declaration.';
    helpText.textContent = backend
      ? 'The exact declarations and source locations are visible here. Parameters may expose native types because this tab is for low-level work, not normal beginner-facing LSX code.'
      : 'Open Language for inheritance and objects, or User interface for LSHTML, LSCSS, document.find(), events, inputs, and visible controls. The Backend tab contains raw functions, internal records, fixed layouts, and native constants.';
    apiNavSearchLabel.textContent = backend ? 'Find a backend declaration' : 'Find a front-end API';
    apiNavSearch.placeholder = backend ? 'Try: property_hash, glBufferData, native handle...' : 'Try: inheritance, button click, texture...';
    search.placeholder = backend ? 'Example: raw OpenGL, property_hash, native field...' : 'Example: inherit object, find button, load texture...';
  }

  function setApiMode(mode, options = {}) {
    const nextMode = mode === 'backend' ? 'backend' : 'frontend';
    if (apiMode === nextMode && options.force !== true) {
      applySidebarPane(currentPaneName());
      return;
    }
    apiMode = nextMode;
    page = 0;
    navFilter = null;
    search.value = '';
    apiNavSearch.value = '';
    moduleSelect.value = '';
    kindSelect.value = '';
    updateCurrentFilter();
    updateModeText();
    rebuildIndexes();
    renderApiTree();
    render();
    applySidebarPane(currentPaneName());
    if (options.scroll) document.getElementById('api-reference').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.querySelectorAll('[data-sidebar-pane]').forEach(button => {
    button.addEventListener('click', () => {
      const name = button.dataset.sidebarPane;
      if (name === 'api') setApiMode('frontend', { force: true });
      else if (name === 'backend') setApiMode('backend', { force: true });
      else applySidebarPane('guide');
    });
  });
  document.querySelectorAll('[data-open-api-index="true"], .top-link').forEach(link => {
    link.addEventListener('click', () => setApiMode('frontend', { force: true }));
  });
  document.querySelectorAll('[data-open-backend-index="true"]').forEach(link => {
    link.addEventListener('click', () => setApiMode('backend', { force: true }));
  });
  frontendModeButton.addEventListener('click', () => setApiMode('frontend', { force: true }));
  backendModeButton.addEventListener('click', () => setApiMode('backend', { force: true }));

  function updateCurrentFilter() {
    if (!navFilter) {
      currentFilter.hidden = true;
      currentFilterLabel.textContent = '';
      return;
    }
    currentFilter.hidden = false;
    currentFilterLabel.textContent = navFilter.label;
  }

  function activateNavFilter(filter, options = {}) {
    navFilter = filter;
    page = 0;
    search.value = '';
    kindSelect.value = '';
    moduleSelect.value = filter?.module || '';
    updateCurrentFilter();
    renderApiTree();
    render();
    applySidebarPane(currentPaneName());
    if (options.scroll !== false) document.getElementById('api-reference').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (window.innerWidth <= 1080) sidebar.classList.remove('open');
  }

  function renderApiTree() {
    const term = apiNavSearch.value.trim().toLowerCase();
    if (term) {
      const matching = entries.filter(entry => [entry.module, entry.owner, entry.name, entry.publicSignature, entry.friendlyDescription, entry.whatItIs, entry.whenToUse, entry.beginnerNote, entry.memberSummary, entry.howToGet, entry.workflow, entry.commonMistake, entry.description, entry.signature, entry.example, JSON.stringify(entry.parameterDocs || {})]
        .filter(Boolean).join(' ').toLowerCase().includes(term)).slice(0, 120);
      apiNavTree.innerHTML = matching.length ? `<div class="api-nav-search-results">${matching.map(entry => {
        const key = apiEntryKey(entry);
        return `<button class="api-nav-search-result" type="button" data-api-entry-key="${escapeHtml(key)}"><strong>${escapeHtml(entry.module)}.${escapeHtml(entryNameText(entry))}</strong><span>${escapeHtml(entry.kind)}</span></button>`;
      }).join('')}</div>` : '<div class="api-nav-search-empty">No names or descriptions match that search in this tab.</div>';
      apiNavTree.querySelectorAll('[data-api-entry-key]').forEach(button => {
        button.addEventListener('click', () => {
          const key = button.dataset.apiEntryKey;
          const entry = entries.find(item => apiEntryKey(item) === key);
          if (!entry) return;
          if (apiMode === 'backend') signatures.checked = true;
          activateNavFilter({ module: entry.module, label: `${entry.module}.${entryNameText(entry)}`, keys: new Set([key]) });
        });
      });
      return;
    }

    const definitions = apiMode === 'backend' ? BACKEND_CATEGORY_DEFINITIONS : API_CATEGORY_DEFINITIONS;
    const usedModules = new Set();
    const categories = definitions.map(category => {
      const categoryModules = modules.filter(module => !usedModules.has(module) && category.test(module));
      categoryModules.forEach(module => usedModules.add(module));
      return { ...category, modules: categoryModules };
    }).filter(category => category.modules.length);
    const uncategorized = modules.filter(module => !usedModules.has(module));
    if (uncategorized.length) categories.push({ label: 'Other modules', description: 'Additional entries', modules: uncategorized });

    apiNavTree.innerHTML = categories.map(category => {
      const count = category.modules.reduce((total, module) => total + moduleEntries.get(module).length, 0);
      const open = category.modules.includes(navFilter?.module) || (!navFilter && ((apiMode === 'frontend' && category.label === 'Language') || (apiMode === 'backend' && category.label === 'LazyUI internals')));
      return `<details class="api-nav-category" ${open ? 'open' : ''}>
        <summary title="${escapeHtml(category.description)}"><span>${escapeHtml(category.label)}</span><span class="api-nav-summary-count">${count}</span></summary>
        <div class="api-nav-category-body">${category.modules.map(module => {
          const groups = moduleGroups.get(module);
          const moduleOpen = module === navFilter?.module || (!navFilter && (module === 'Language/Inheritance' || module === 'LazyUI/Start here'));
          return `<details class="api-nav-module-group" ${moduleOpen ? 'open' : ''}>
            <summary><span class="api-nav-module-name">${escapeHtml(module.replace(/^.*\//, ''))}</span><span class="api-nav-summary-count">${moduleEntries.get(module).length}</span></summary>
            <div class="api-nav-module-actions">
              <button class="api-nav-all ${navFilter?.module === module && navFilter?.allModule ? 'active' : ''}" type="button" data-api-module="${escapeHtml(module)}"><span>All ${escapeHtml(module)}</span><span class="api-nav-item-count">${moduleEntries.get(module).length}</span></button>
              ${groups.map((group, index) => {
                const groupId = `${module}|${index}`;
                const active = navFilter?.groupId === groupId;
                return `<button class="api-nav-group ${active ? 'active' : ''}" type="button" data-api-group="${escapeHtml(groupId)}"><span>${escapeHtml(group.label)}</span><span class="api-nav-item-count">${group.entries.length}</span></button>`;
              }).join('')}
            </div>
          </details>`;
        }).join('')}</div>
      </details>`;
    }).join('');

    apiNavTree.querySelectorAll('[data-api-module]').forEach(button => {
      button.addEventListener('click', () => {
        const module = button.dataset.apiModule;
        activateNavFilter({ module, label: `All ${module}`, allModule: true });
      });
    });
    apiNavTree.querySelectorAll('[data-api-group]').forEach(button => {
      button.addEventListener('click', () => {
        const [module, indexText] = button.dataset.apiGroup.split('|');
        const index = Number(indexText);
        const group = moduleGroups.get(module)?.[index];
        if (!group) return;
        activateNavFilter({ module, groupId: button.dataset.apiGroup, label: `${module} → ${group.label}`, keys: new Set(group.entries.map(apiEntryKey)) });
      });
    });
  }

  function filteredEntries() {
    const term = search.value.trim().toLowerCase();
    return entries.filter(entry => {
      if (navFilter?.keys && !navFilter.keys.has(apiEntryKey(entry))) return false;
      if (navFilter?.allModule && entry.module !== navFilter.module) return false;
      if (moduleSelect.value && entry.module !== moduleSelect.value) return false;
      if (kindSelect.value && entry.kind !== kindSelect.value) return false;
      if (!term) return true;
      return [entry.module, entry.kind, entry.owner, entry.name, entry.publicSignature, entry.signature, entry.friendlyDescription, entry.whatItIs, entry.whenToUse, entry.beginnerNote, entry.memberSummary, entry.howToGet, entry.workflow, entry.commonMistake, entry.description, entry.example, entry.source]
        .filter(Boolean).join(' ').toLowerCase().includes(term);
    });
  }

  function renderModuleGuide(filtered) {
    const selectedModule = navFilter?.module || moduleSelect.value || (filtered.length && filtered.every(entry => entry.module === filtered[0].module) ? filtered[0].module : '');
    const guide = apiData.moduleGuides?.[selectedModule];
    if (!selectedModule || !guide) {
      moduleGuide.hidden = true;
      moduleGuide.innerHTML = '';
      return;
    }
    moduleGuide.hidden = false;
    moduleGuide.innerHTML = `
      <div class="api-module-guide-head">
        <div>
          <span class="api-level api-level-${escapeHtml(guide.level || 'beginner')}">${escapeHtml(guide.level || 'beginner')}</span>
          <h3>${escapeHtml(guide.title || selectedModule)}</h3>
          <code>${escapeHtml(selectedModule)}</code>
        </div>
      </div>
      <div class="api-concept-grid">
        <div><strong>What this section is</strong><p>${escapeHtml(guide.whatItIs || '')}</p></div>
        <div><strong>When you use it</strong><p>${escapeHtml(guide.whenToUse || '')}</p></div>
        <div><strong>Start here</strong><p>${escapeHtml(guide.beginnerStart || '')}</p></div>
        <div><strong>Before using it</strong><p>${escapeHtml(guide.requires || 'No special setup is required.')}</p></div>
        <div><strong>Cleanup</strong><p>${escapeHtml(guide.cleanup || 'Follow the ownership note on each entry.')}</p></div>
      </div>`;
  }

  function conceptBlock(label, value, className = '') {
    if (!value) return '';
    return `<div class="api-concept ${className}"><strong>${escapeHtml(label)}</strong><p>${escapeHtml(value)}</p></div>`;
  }

  function render() {
    const filtered = filteredEntries();
    renderModuleGuide(filtered);
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    page = Math.min(Math.max(page, 0), pages - 1);
    const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);
    results.classList.toggle('show-signatures', apiMode === 'backend' && signatures.checked);
    results.innerHTML = visible.length ? visible.map(entry => {
      const qualified = `${entry.module}.${entry.owner ? `${entry.owner}.` : ''}${entry.name}`;
      const entryId = `api-${apiEntryKey(entry).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
      const ownerGroup = entry.owner ? moduleGroups.get(entry.module)?.find(group => group.owner && group.label === entry.owner) : null;
      const ownerLabel = ownerGroup ? `<button class="api-owner-link" type="button" data-api-owner-module="${escapeHtml(entry.module)}" data-api-owner="${escapeHtml(entry.owner)}">Part of ${escapeHtml(entry.owner)} — show its public API</button>` : '';
      const level = entry.level || (apiMode === 'backend' ? 'advanced' : 'beginner');
      const parameterRows = entry.parameterDocs && Object.keys(entry.parameterDocs).length
        ? `<div class="api-parameters"><strong>What the inputs mean</strong>${Object.entries(entry.parameterDocs).map(([name, description]) => `<div><code>${escapeHtml(name)}</code><span>${escapeHtml(description)}</span></div>`).join('')}</div>`
        : '';
      const related = entry.related?.length ? `<div class="api-related"><strong>Related</strong>${entry.related.map(value => `<code>${escapeHtml(value)}</code>`).join('')}</div>` : '';
      const callShape = apiMode === 'backend' ? entry.signature : (entry.publicSignature || entry.signature);
      const signatureBlock = apiMode === 'backend' ? `<div class="api-signature"><div class="api-signature-label">Exact backend declaration</div><pre>${escapeHtml(entry.signature)}</pre></div>` : '';
      const meta = apiMode === 'backend' ? `<div class="api-meta">Source: ${escapeHtml(entry.source)}:${entry.line}${entry.dll ? ` · Native library: ${escapeHtml(entry.dll)}` : ''}</div>` : '';
      const exampleTitle = apiMode === 'backend' ? 'Backend/native usage' : 'Copy-ready LSX example';
      const exampleNote = entry.exampleNote || (apiMode === 'backend' ? 'Low-level declaration or usage example.' : 'Normal front-end LSX usage.');
      return `<article class="api-entry ${apiMode === 'backend' ? 'backend-entry' : ''}" id="${escapeHtml(entryId)}">
        <div class="api-entry-head">
          <div class="api-entry-name">
            <div class="api-entry-labels"><span class="api-level api-level-${escapeHtml(level)}">${escapeHtml(level)}</span>${ownerLabel}</div>
            <strong>${escapeHtml(qualified)}</strong>
            <span>${escapeHtml(entry.friendlyDescription || entry.description || 'No description is available yet.')}</span>
            <code class="api-call-shape">${escapeHtml(callShape)}</code>
          </div>
          <span class="api-badge">${escapeHtml(entry.kind)}</span>
        </div>
        ${apiMode === 'backend' ? '<div class="api-backend-warning">This entry is intentionally separated from the beginner-facing API because it exposes native or internal implementation details.</div>' : ''}
        <div class="api-explanation-grid">
          ${conceptBlock('What this is', entry.whatItIs)}
          ${conceptBlock('When you use it', entry.whenToUse)}
          ${conceptBlock('What it contains', entry.memberSummary)}
          ${conceptBlock('How you get one', entry.howToGet)}
          ${conceptBlock('How it fits into a real task', entry.workflow)}
          ${conceptBlock('Beginner note', entry.beginnerNote, 'api-concept-note')}
          ${conceptBlock('Before you call it', entry.requires)}
          ${conceptBlock('What comes back', entry.returnsDescription)}
          ${conceptBlock('Common mistake', entry.commonMistake, 'api-concept-warning')}
          ${conceptBlock('Cleanup', entry.cleanup)}
        </div>
        ${parameterRows}
        <div class="api-example">
          <div class="api-example-head">
            <div><strong>${escapeHtml(exampleTitle)}</strong><span>${escapeHtml(exampleNote)}</span></div>
            <button class="copy-button api-copy-button" type="button" data-api-copy="true">Copy</button>
          </div>
          <pre><code>${escapeHtml(entry.example || callShape)}</code></pre>
        </div>
        ${related}
        ${signatureBlock}
        ${meta}
      </article>`;
    }).join('') : `<div class="api-empty">No matching ${apiMode === 'backend' ? 'backend' : 'front-end'} API entries.</div>`;
    pageLabel.textContent = filtered.length ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, filtered.length)} of ${filtered.length}` : '0 results';
    previous.disabled = page === 0;
    next.disabled = page >= pages - 1;
  }

  results.addEventListener('click', event => {
    const ownerButton = event.target.closest('[data-api-owner]');
    if (ownerButton) {
      const module = ownerButton.dataset.apiOwnerModule;
      const owner = ownerButton.dataset.apiOwner;
      const groupIndex = moduleGroups.get(module)?.findIndex(group => group.owner && group.label === owner) ?? -1;
      const group = groupIndex >= 0 ? moduleGroups.get(module)[groupIndex] : null;
      if (group) activateNavFilter({ module, groupId: `${module}|${groupIndex}`, label: `${module} → ${owner}`, keys: new Set(group.entries.map(apiEntryKey)) });
      return;
    }
    const button = event.target.closest('[data-api-copy="true"]');
    if (!button) return;
    const code = button.closest('.api-example')?.querySelector('code');
    if (code) copyText(code.textContent);
  });

  apiNavSearch.addEventListener('input', renderApiTree);
  search.addEventListener('input', () => { page = 0; render(); });
  moduleSelect.addEventListener('change', () => {
    navFilter = null;
    page = 0;
    updateCurrentFilter();
    renderApiTree();
    render();
  });
  kindSelect.addEventListener('change', () => { page = 0; render(); });
  signatures.addEventListener('change', render);
  clearNavFilter.addEventListener('click', () => {
    navFilter = null;
    moduleSelect.value = '';
    page = 0;
    updateCurrentFilter();
    renderApiTree();
    render();
  });
  previous.addEventListener('click', () => { page -= 1; render(); document.getElementById('api-reference').scrollIntoView(); });
  next.addEventListener('click', () => { page += 1; render(); document.getElementById('api-reference').scrollIntoView(); });

  updateModeText();
  rebuildIndexes();
  renderApiTree();
  render();
  const params = new URLSearchParams(location.search);
  const apiQuery = params.get('api');
  const backendQuery = params.get('backend');
  if (backendQuery !== null) {
    setApiMode('backend', { force: true });
    if (backendQuery) {
      search.value = backendQuery;
      render();
    }
  } else if (apiQuery) {
    search.value = apiQuery;
    page = 0;
    render();
    applySidebarPane('api');
  } else if (location.hash === '#api-reference') applySidebarPane('api');
}
function initialize() {
  document.getElementById('full-app-code').textContent = fullAppSource;
  renderExamples();
  renderElementGrid();
  setupCopyButtons();
  setupLivePreviewControls();
  setupNavigation();
  setupGuideSearch();
  setupApiReference();
}

initialize();
